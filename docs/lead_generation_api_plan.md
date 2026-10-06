# Lead generation: what to pay for, and what will actually raise yield

**Who this is for:** the product manager, and anyone deciding budget.  
**Date of the live test:** 28 September 2026  
**Production checked:** `https://api.salesengine.thefactory23.com` (health returned OK) and the live Sales Engine backend in the `sales-engine` namespace.  
**Code changes:** none. This is a test and a plan.

---

## The verdict

The belief that “we are not getting enough leads because we are not on paid plans” is **half right**.

It is right about **two providers**:

1. **Serper** (the Google search API that finds most companies) is still on the **free account**. A live search for 20 results with a realistic manufacturer query was rejected with: `Query pattern not allowed for free accounts.` Production history also contains **181 searches that failed with `Not enough credits`.** This is the main paid upgrade that increases how many companies a generate click can see.
2. **Apollo** (the contact database) is on the **Free plan**. A live people search was rejected with: the people-search API is **not included on the Free plan**. Paying is required before Apollo can return people. Paying alone is not enough: the current code also sends the key in the wrong place, so a paid plan would still return nothing until that call is fixed.
3. **X (Twitter)** social search is already dead: every recent call returned **402 `credits depleted`**. That hurts social listening. It does not fill the company lead list, because the company-discovery adapter for X returns nothing even when a key exists.

It is **wrong** as a general explanation:

- The product **is** creating leads. Production has **594 leads in the last 30 days**, and **295 in the last 7 days**.
- **420** of those came from Serper and **165** from Hunter. Both of those APIs answered successfully on 28 September 2026.
- **Hunter is on the Free plan and is not out of credits.** The live account shows **50 search credits still available** and **100 verifications still available**, resetting on **20 October 2026**. Hunter Discover (company search) is free and is already contributing leads.
- **GLM** (the model that extracts and scores) answered successfully, including the scoring model `glm-4-air`. It is not blocking lead generation.
- **YouTube** search answered successfully on the free quota.
- **Meta**’s token is valid.
- **SendGrid** has credits left. SendGrid sends email. It does not find leads.
- Five “discovery” adapters (**Apollo, YouTube, X, Reddit, Meta**) are **stubs**. They return an empty list even when a key is present. Buying those platforms does not add company leads until the adapters are actually built.
- On the first generate click, **contact lookup is turned off on purpose** so the run can spend its time creating company cards. That is why most cards are a website with no email. It is a product choice, not an empty wallet.

**What users are feeling:** company cards are thinner than a request for 50, and almost none of them can be emailed. **4% of saved leads have an email (24 of 594). 7% have an email or a phone (42 of 594).** Hunter’s 165 company leads have **zero** emails on the card, because Discover does not fetch emails and the email step is skipped.

---

## Scores

These scores are the chance that one generate click feels successful. 0 means the click returns nothing. 10 means a request for about 50 companies usually comes back with a full, contactable, on-ICP list. Even a strong data stack does not honestly score 10, because many real companies never publish an email.

| Stage                                                                                                              | Company list | Contactable leads (email or phone) | Overall    |
| ------------------------------------------------------------------------------------------------------------------ | ------------ | ---------------------------------- | ---------- |
| **Today, measured in production**                                                                                  | **4 / 10**   | **2 / 10**                         | **3 / 10** |
| Pay Serper only, and change no code                                                                                | 6 / 10       | 2 / 10                             | 4 / 10     |
| **Do the full plan in this document** (the payments below, plus the engineering that makes those payments do work) | **8 / 10**   | **6 / 10**                         | **7 / 10** |

Why today is a 4 on companies, not a 1: Serper and Hunter are alive, the country catalog in production already has **196 countries** (including Germany, the Netherlands, and Denmark), and hundreds of leads were saved this month.

Why it is not a 7 yet: the free Serper plan refuses the deeper, more specific searches the product wants to run; a generate run is capped at about **12 searches per country**, **20 results only if Serper allows it** (it currently does not), and about **2.5 minutes**; Apollo, YouTube, X, Reddit, and Meta never add companies; and the run stops before it looks up emails.

Why the full plan is a 7, not a 10: paid Serper improves the pile of websites. Paid Hunter and a fixed, paid Apollo put emails on a **large share** of those websites, not on every one. A narrow manufacturer ICP in a small country will still sometimes return fewer than 50 contactable people. The score moves because empty runs and website-only cards stop being the normal outcome.

---

## What production is doing today

```text
User asks for leads
        │
        ▼
Serper (Google results) ── working, FREE plan, query restrictions, credits have hit zero before
Hunter Discover        ── working, FREE plan, companies only, emails not used up
Mono (Nigeria registry)── key missing
Fylings (registry)     ── key present, host does not exist
Apollo company search  ── stub, returns nothing
YouTube / X / Reddit / Meta company search ── stubs, return nothing
        │
        ▼
Keep companies, drop the wrong country, stop at ~2.5 minutes
        │
        ▼
Save the lead. Email/phone lookup is skipped on this first pass.
        │
        ▼
Later, only sometimes:
  snippets (almost no emails) → Bytemine (no key) → Cleanlist (no key)
  → Apollo people search (Free plan, and the call is rejected)
  → Hunter email finder (Free plan, credits available, rarely called)
```

Observed production totals:

| Fact                                                        | Number                      |
| ----------------------------------------------------------- | --------------------------- |
| Leads saved, last 30 days                                   | 594                         |
| Leads saved, last 7 days                                    | 295                         |
| From Serper                                                 | 420                         |
| From Hunter                                                 | 165                         |
| From social (LinkedIn, Meta, Reddit combined)               | 4                           |
| Leads with an email                                         | 24 (4%)                     |
| Leads with a phone                                          | 22                          |
| Leads with either                                           | 42 (7%)                     |
| Hunter company leads that have an email                     | 0 of 165                    |
| Serper calls that succeeded                                 | 3,155                       |
| Serper calls rejected for “Not enough credits”              | 181                         |
| X calls rejected for “credits depleted”                     | 85, including the live test |
| Apollo enrichment attempts that found an email              | 0 of 34                     |
| Hunter email-finder credits actually spent (enrichment log) | 6, which found 6 emails     |
| GLM calls that succeeded                                    | 4,096                       |

The September 25 note that only eight countries are supported is **out of date**. The running production app has the 196-country catalog.

---

## Every API, tested

Prices below are the public figures as of this review. Confirm the number in the provider’s own billing screen before anyone pays. Pack prices move, and a few vendors only show the paid price after login.

### 1. Serper — pay this first

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role                     | Primary company discovery. Also the search behind LinkedIn, Reddit, X, and Meta **public** mentions.                                                                                                                                                                                                                                                                                                                               |
| Live result              | Simple 10-result search: **200 OK, 10 results.** Account balance endpoint: **1,772 credits.** A 20-result search with quotes, `OR`, and `site:.de`: **400 `Query pattern not allowed for free accounts.`**                                                                                                                                                                                                                         |
| History                  | 181 failures: `Not enough credits`.                                                                                                                                                                                                                                                                                                                                                                                                |
| Plan today               | **Free.** The product is configured to ask for 20 results (`SERPER_MAX_RESULTS=20`). The free plan refuses that class of query, and the code then retries a shorter query with at most 10 results. Users get the weaker search.                                                                                                                                                                                                    |
| What a paid plan changes | Deeper result pages and the specific queries the engine already builds (country, `site:`, OR across product words). It also removes the cliff where the next generate click returns nothing because credits hit zero.                                                                                                                                                                                                              |
| What it does not change  | It still returns web pages, not a verified email. Emails stay rare until the enrichment job below is turned on.                                                                                                                                                                                                                                                                                                                    |
| Price to budget          | Free grant is **2,500 queries**, one time. Paid packs published by Serper’s buyers in 2026: **$50 / 50,000 credits**, then **$375 / 500,000**, **$1,250 / 2.5 million**, **$3,750 / 12.5 million**. Credits expire about **6 months** after purchase. A normal search is **1 credit** (up to 10 results). Asking for 11–100 results is **2 credits**. Confirm the pack in the Serper dashboard: [serper.dev](https://serper.dev/). |
| Buy                      | **The $50 / 50,000 pack**, unless the dashboard shows a different entry pack. That is enough for hundreds of generate clicks. Re-test the 20-result query after purchase. Only keep `SERPER_MAX_RESULTS=20` once that test returns 200.                                                                                                                                                                                            |

Credit math for the product manager: one country on a “give me 50” request plans about **10 Serper searches** (the code caps a country at 12). Three countries is about **30 searches**. On a paid plan at 2 credits each, that click costs about **60 credits**. 50,000 credits is on the order of **800** such clicks, shared by every customer. The $50 pack is the right first purchase. The $375 pack is the right second purchase only after usage shows the $50 pack lasting less than a month.

### 2. Apollo — pay this second, only together with a code fix

|                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role            | Meant to find people and emails, and (in the architecture diagram) companies.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Live result     | Usage endpoint accepts the key. The people-search call the product should be making returned **403**: the API **is not included on the Free plan**. The call the product actually makes (`api_key` in the JSON body, old URL) returned **422**: Apollo now requires the key in the `X-Api-Key` header. Docs: [docs.apollo.io — test the API key](https://docs.apollo.io/docs/test-api-key).                                                                                                                                   |
| History         | 34 enrichment attempts, **0 emails, 0 phones**. Today’s usage counters for people search were still at **0 consumed**, which matches calls that never successfully searched.                                                                                                                                                                                                                                                                                                                                                  |
| Code gap        | `ApolloDiscoveryAdapter` is a stub. A paid Apollo plan **does not add company leads** until that adapter is written. `ApolloPersonEnricher` must be updated to the current header and endpoint or the paid plan still returns nothing.                                                                                                                                                                                                                                                                                        |
| Price to budget | Apollo’s own error says **all paid plans include full API access.** Public list prices often shown in 2026: **Basic about $49 per user/month** billed annually, **Professional about $79**, **Organization about $119** with a three-seat minimum. Start with the **lowest paid plan whose upgrade screen says API access is included.** Do not buy a three-seat Organization contract until a one-seat paid plan has been re-tested and still returns 403. Pricing page: [apollo.io/pricing](https://www.apollo.io/pricing). |
| Buy             | Lowest paid plan with API access, **after** engineering confirms the header fix is ready to ship in the same week. Budget **about $49–$79 per month** for one seat as the planning number, and replace it with the figure on the upgrade screen.                                                                                                                                                                                                                                                                              |

### 3. Hunter — keep Free for company discovery; pay when emails are turned on

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role                | Hunter **Discover** finds companies. Hunter **Email Finder / Domain Search** finds emails and spends credits.                                                                                                                                                                                                                                                                                                                                                                       |
| Live result         | **200 OK.** Plan name: **Free**. Plan level: 0. Searches available: **50**. Searches used: **0**. Verifications available: **100**. Verifications used: **0**. Reset date: **20 October 2026**.                                                                                                                                                                                                                                                                                     |
| History             | 87 successful Discover calls, 165 company leads, **0 emails on those leads**. Six emails were found later on other (Serper) leads, using 6 credits. A handful of Discover calls failed because the sentence was not a company description (`query_not_suitable`), not because of credits.                                                                                                                                                                                           |
| What paying changes | More **emails per month**, and advanced Discover filters. It does not unlock company search. Company search is already free and already working.                                                                                                                                                                                                                                                                                                                                    |
| Price               | From [hunter.io/pricing](https://hunter.io/pricing): **Free: 50 credits/month.** **Starter: $49/month, or $34/month billed yearly, 2,000 credits/month.** **Growth: $149/month, or $104/month yearly, 10,000 credits.** **Scale: $299/month, or $209/month yearly, 25,000 credits.** One credit is one email found. A miss does not spend a credit. Discover itself stays free. Help: [How credits work](https://help.hunter.io/en/articles/1911617-how-do-credits-work-in-hunter). |
| Buy                 | **Starter ($49/month, or $34/month yearly)** in the same release that starts calling Email Finder on saved company domains. 2,000 found emails a month, shared across all customers, is the right first ceiling. Move to Growth only when the enrichment log shows the 2,000 being used up.                                                                                                                                                                                         |

### 4. GLM (Zhipu / BigModel) — working; do not treat this as the lead problem

|             |                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role        | Turns a search snippet into a company name, scores ICP fit, writes chat and outreach drafts.                                                                                                                                                                                                                                               |
| Live result | `glm-4-flash`: **200.** `glm-4-air`: **200.** 4,096 historical calls at HTTP 200.                                                                                                                                                                                                                                                          |
| Price       | Pay-as-you-go on [open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing). **GLM-4-Flash is listed free.** **GLM-4-Air is a low per-million-token price** (the public GLM-4 table has shown on the order of ¥0.5 per million input tokens). Confirm in the BigModel console. This bill stays small next to Serper, Hunter, and Apollo. |
| Buy         | Keep the key funded so scoring never stops. No plan upgrade is required to get more leads.                                                                                                                                                                                                                                                 |

### 5. X — out of credits; low priority for lead count

|             |                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role        | Native social listening (`GET /2/tweets/search/recent`). Company discovery for X is a **stub**.                                                                                                                                                                                                                                                                  |
| Live result | **402 Payment Required. `credits depleted`.** Same failure on all **85** logged calls.                                                                                                                                                                                                                                                                           |
| Price       | X moved to prepaid credits. Public 2026 write-ups put a **read of someone else’s post at about $0.005 per post**. A search that returns 10 posts is about **$0.05**. There is no meaningful free search tier left. Console: [developer.x.com](https://developer.x.com/).                                                                                         |
| Buy         | A **small credit top-up (plan on about $20–$50 to start)** only if social listening on X is a feature we are promising in the product. It will not raise the company-lead count until the stub adapter is replaced, and replacing it is not the best use of engineering time. Until credits exist, stop calling X so runs do not record a failure on every scan. |

### 6. YouTube — working; do not pay

|             |                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role        | Social listening search. Company discovery is a **stub**, so YouTube results never become lead cards.                                                                                                                                                                                         |
| Live result | **200 OK**, one video returned. **85** historical calls at HTTP 200.                                                                                                                                                                                                                          |
| Price       | Google’s default quota is **10,000 units/day**. Search costs **100 units**, so about **100 searches/day** are free. Extra quota is requested from Google; it is not a normal credit card plan. Docs: [YouTube Data API quota](https://developers.google.com/youtube/v3/determine_quota_cost). |
| Buy         | Nothing. The free quota is enough for listening. More quota does not create company leads while the discovery adapter is a stub.                                                                                                                                                              |

### 7. Reddit — key missing; the useful tier is free

|             |                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role        | Native Reddit search for social listening. Company discovery is a **stub**. One saved lead has source `social_reddit`; that came through Serper, not the Reddit API.                     |
| Live result | `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are **empty**, so native Reddit never runs.                                                                                                |
| Price       | Reddit’s API app credentials for normal read access are **free**, with rate limits. Commercial use needs Reddit’s developer terms. [reddit.com/dev/api](https://www.reddit.com/dev/api). |
| Buy         | Nothing. If native Reddit listening is wanted, create a free app and set the two env vars. That adds posts, not a database of companies.                                                 |

### 8. Meta (Facebook / Instagram Graph) — token works; do not buy this for leads

|             |                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role        | Reads posts from Facebook pages whose IDs we configure. Company discovery is a **stub**.                                                                                                                           |
| Live result | Token check against Graph: **200 OK**. Two leads in the database have source `social_meta`.                                                                                                                        |
| Price       | The Graph API itself is not a lead-credit product. It needs a Meta app, a page access token, and the page IDs the customer cares about. [developers.facebook.com](https://developers.facebook.com/docs/graph-api). |
| Buy         | Nothing for lead volume. Page IDs are a configuration task, not a plan upgrade.                                                                                                                                    |

### 9. Fylings — remove it

|             |                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Role        | Was intended as a multi-country company registry.                                                                                               |
| Live result | A key **is** set in production. The call failed because **`api.fylings.com` does not exist** (DNS does not resolve) from the production server. |
| Buy         | **Do not pay.** Remove the key so the product stops calling a dead host.                                                                        |

### 10. Mono — not a global lead engine

|             |                                                                                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role        | Nigerian company registry search (`/v1/companies/search`).                                                                                                                                                                                      |
| Live result | **No key in production.** The host resolves. The adapter is real, and it only covers Nigeria.                                                                                                                                                   |
| Buy         | Only if “search the Nigerian corporate registry” is a feature we sell. It will not increase leads in Europe, the US, or the rest of the 196-country catalog. Get the current price from Mono before turning it on: [mono.co](https://mono.co/). |

### 11. Bytemine and Cleanlist — not configured; not the first purchase

|             |                                                                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role        | Optional middle step in the contact waterfall, before Apollo and Hunter.                                                                                                                                                                              |
| Live result | **Both keys are empty.** Both hosts resolve. They have never run. The waterfall already jumps from “text on the web page” to Apollo (broken) and Hunter (rarely called).                                                                              |
| Buy         | **Do not buy these to fix the current drought.** After Hunter Starter and a working Apollo are in place, revisit them only if their pricing is cheaper per found email than Hunter. No public price was reliable enough to put a number in this plan. |

### 12. SendGrid — not a lead source

|             |                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role        | Sends outreach email after a lead exists.                                                                                                               |
| Live result | Credits endpoint **200**. Remain **100**, total **100**, used **0**. The product also caps platform sending at **30 emails/day** in configuration.      |
| Buy         | Nothing for lead generation. A paid SendGrid plan matters only when customers are sending more mail than the free allowance. It cannot create the lead. |

---

## The plan that raises the score from 3 to 7

Do these in order. Skipping the engineering steps and only entering a credit card leaves the score near 4.

### This week — money

1. **Buy the Serper entry pack (plan on $50 for 50,000 credits).** Confirm the price in the Serper dashboard, pay, then re-run one complex 20-result search. Success looks like HTTP 200 and about 20 results, not `Query pattern not allowed for free accounts.`
2. **Leave Hunter on Free until the email job in step 6 is ready to ship.** The 50 credits are intact and reset on 20 October 2026.
3. **Leave Apollo unpaid until the code fix in step 5 is in the same release.** Then buy the cheapest Apollo plan that includes API access (plan on one seat, about $49–$79/month, and use the price Apollo shows).
4. **Do not buy X, YouTube quota, Reddit, Meta, Fylings, Mono, Bytemine, Cleanlist, or extra SendGrid in order to get more leads.**

### This week — engineering, or the payments above are wasted

5. **Fix the Apollo people call** so the key goes in the `X-Api-Key` header and the URL is the current people-search / people-match endpoint from Apollo’s docs. Re-test on production. The pass condition is a person result, not a 403 or a 422. Buy the Apollo seat in the same week this ships.
6. **Add a background email job** that runs after the company list is saved. For each company with a website and no email, call Hunter Email Finder or Domain Search, then Apollo people match for the gaps. The first click stays fast. The card fills in over the next couple of minutes. Today that work is skipped on purpose (`deferContactEnrichment` defaults to on) and the run also gives up at **150 seconds**. Buy Hunter Starter in the same week this ships.
7. **Turn off Fylings** (dead host) and **skip X** until it has credits, so a listening run is not a string of 402s.
8. **Show the real search and the real gap in the product.** If Serper is rejected, say “web search is out of credits” (the backend already knows this reason). If the card has only a website, say “company found, email not looked up yet” while the job in step 6 runs.

### Next, only if the week-one metrics move

9. Watch Hunter `enrichment_logs`. If found emails approach 2,000 in a month, move from Starter to Growth.
10. **Replace the Apollo company-search stub** only after the people API is proven on the paid plan. That is how Apollo starts adding companies, not just emails. Until then, Serper plus Hunter Discover remain the company sources.
11. **Serper’s next pack ($375 / 500,000)** only if the $50 pack is on track to run out inside the 6-month expiry. Put a balance check on a weekly ops note so we never repeat the 181 “Not enough credits” failures.

### What we should expect after the full plan

These are planning ranges, not a guarantee on every ICP.

|                                                                           | Today                                                                                 | After the full plan                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A normal generate click in a catalog country, with a short product phrase | Often a small handful of companies; sometimes more; sometimes an empty country filter | A materially fuller company list, because each search can keep 20 results and the specific query is allowed to run     |
| Emails on those cards                                                     | About 4% of saved leads                                                               | A large minority of company cards, limited by Hunter’s monthly credits and by companies that have no public email      |
| A request for 50 contactable people in one click                          | Not a realistic outcome                                                               | Realistic for a broad ICP in a large country; still optimistic for a narrow manufacturer definition in a small country |
| A run that dies because Serper credits are gone                           | Has already happened 181 times, and the free plan can do it again                     | Avoided while the $50 pack lasts and someone watches the balance                                                       |
| Overall score                                                             | **3 / 10**                                                                            | **7 / 10**                                                                                                             |

The single highest-leverage sentence for the roadmap: **pay Serper so the search is allowed to be specific, then pay Hunter and Apollo to put emails on the companies Serper already finds, and ship the two code fixes (Apollo’s header, and the email job) in the same release as those bills.**

---

## Monthly budget to put in front of finance

Planning numbers only. The provider’s checkout page wins if it disagrees.

| Item                                                    | When                                  | Planning cost                                                                   | What we get                                                                 |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Serper 50,000-credit pack                               | Now                                   | **$50 once** (lasts months at current volume; expires ~6 months after purchase) | Searches stop being rejected for pattern and, for a long while, for credits |
| Apollo lowest paid API seat                             | Same week as the header fix           | **About $49–$79 / month**                                                       | People and emails become allowed. Confirm API is included before paying     |
| Hunter Starter                                          | Same week as the email job            | **$49 / month**, or **$34 / month** yearly                                      | About 2,000 found emails / month, shared by all customers                   |
| GLM                                                     | Keep a small balance                  | A few dollars of usage, Flash often $0                                          | Scoring and extraction stay up                                              |
| X credits                                               | Only if X listening is in the promise | **$20–$50** to start, then usage                                                | Social posts, not company leads                                             |
| **First-month total if we do Serper + Apollo + Hunter** |                                       | **About $150–$180**, then about **$80–$130 / month** after the Serper pack      | The 3 → 7 path                                                              |

Buying every logo in the env file would spend more and would not move the score past the “pay only” row, because stubs, the deferred email step, and the dead Fylings host do not start working when a card is charged.

---

## Official pages

- Serper: [https://serper.dev/](https://serper.dev/)
- Apollo pricing: [https://www.apollo.io/pricing](https://www.apollo.io/pricing)
- Apollo API key docs: [https://docs.apollo.io/docs/test-api-key](https://docs.apollo.io/docs/test-api-key)
- Hunter pricing: [https://hunter.io/pricing](https://hunter.io/pricing)
- Hunter credits: [https://help.hunter.io/en/articles/1911617-how-do-credits-work-in-hunter](https://help.hunter.io/en/articles/1911617-how-do-credits-work-in-hunter)
- BigModel / GLM pricing: [https://open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing)
- X developer console: [https://developer.x.com/](https://developer.x.com/)
- YouTube quota: [https://developers.google.com/youtube/v3/determine_quota_cost](https://developers.google.com/youtube/v3/determine_quota_cost)
- Reddit API: [https://www.reddit.com/dev/api](https://www.reddit.com/dev/api)
- Meta Graph: [https://developers.facebook.com/docs/graph-api](https://developers.facebook.com/docs/graph-api)
- Mono: [https://mono.co/](https://mono.co/)

---

## How this was tested

On 28 September 2026, from the production backend, with the keys that production actually uses:

- Health check on the public API returned OK.
- Each configured provider was called once, or an account/usage endpoint was called when that existed.
- Lead counts, email/phone presence, and provider error totals were read as aggregates. No customer email addresses and no API keys are in this document.
- The Serper test spent **one** successful credit on a 10-result search. The 20-result probe was rejected and should not have spent a credit. YouTube spent one small search. GLM spent a few tokens. Apollo’s people search was rejected before it could spend a credit. X was rejected for depleted credits.

The test did not click through the customer UI as a logged-in user. The numbers above are from the APIs and the production database, which is the stronger evidence for credits and plans.
