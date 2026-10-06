# So a request for 20 leads returns 20, and a request for 500 returns 500

**For:** the owner  
**Date:** 28 September 2026  
**What this asks you to approve:** three paid data plans, used so the product keeps going until it has the number of leads the user asked for.

Customers are not complaining that the product is empty. They are complaining that they ask for a number and receive far less than that number. A request for 20 often comes back as a handful. A request for 500 cannot be fulfilled at all on the plans we have now.

The free plans are the reason those numbers are out of reach. The plans below are the ones that hold enough companies and enough emails to meet the request.

---

## The yardstick

Judge this by the number on the request, not by how many leads the whole product saved in a month.

| What the user asks for                                   | What they get today                                                                                | What they get once these paid plans are in use                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **20** companies in a real market                        | Often a handful. If they type no number, the product only aims at 12                               | **20 companies**                                                                             |
| **500** companies in a broad industry and a real country | The product will not search for 500. It cuts the request to 150, then stops after one short search | **500 companies**, with the count climbing on screen until it arrives                        |
| **500** companies in a very small niche                  | A short list, and no explanation                                                                   | **Every company that matches**, for example 60, and a clear line that the market has no more |
| An email on those companies                              | About **1 in 25** saved leads has an email                                                         | About **1 in 3** companies, until the monthly allowance of **2,000** emails is used          |

That is the standard this spend is for. Ask for 20, get 20. Ask for 500 companies in a market that has them, get 500.

---

## Why the free plans cannot meet that standard

We checked the live accounts on 28 September 2026.

**Serper** is the Google search behind most company cards. It is on the free plan.

- A normal manufacturer search for 20 results was refused: “Query pattern not allowed for free accounts.”
- The free plan allows about **10** results, and it forces the specific product-and-country search to be shortened.
- The same account has already failed **181** searches with “Not enough credits.” Those clicks find nothing.
- Ten results, once, cannot become 20 matched companies, and they cannot become 500.

**Apollo** is the company database that actually contains hundreds of matching firms in a broad industry. It is on the free plan.

- We called the search. Apollo refused it: that API **is not included on the Free plan.**
- **34** attempts in production found **no emails and no phone numbers.**
- Without this paid search, there is no source to turn the page and collect company 101 through company 500. Web search does not hold them on the first page.

**Hunter** finds the email address. It is on the free plan.

- Company search on Hunter already works, and those company cards have **no email.**
- The free plan allows **50 emails a month** for every customer combined. We have **50 still unused**, and they reset on **20 October 2026.**
- Fifty emails a month cannot cover a user who asked for 20 people they can email, repeated across customers, and it cannot cover a request for a large contactable list.
- The paid Starter plan allows **2,000 emails a month.** That is **40 times** the free allowance. One credit is one email found. A miss does not spend a credit.

The other APIs in the product (YouTube, Reddit, Meta, the email-sending account) are not what stands between a user and the number they typed. This request does not include them.

---

## What to approve

Confirm each price on the provider’s own page before paying.

| Plan                                                   | Why it is required for the yardstick                                                                                     | Cost                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Serper**, 50,000 credits                             | So the search for the first companies is allowed to be specific, and so a click no longer dies with “not enough credits” | **$50 once.** Enough for months of searching. Credits expire about 6 months after purchase |
| **Apollo**, the lowest paid seat that includes the API | So a request for 100 or 500 can take the next page of companies, which the free plan blocks                              | **About $49 to $79 per month** for one seat                                                |
| **Hunter Starter**                                     | So the companies on that list can receive an email, up to **2,000** found emails a month                                 | **$49 per month**, or **$34 per month** if billed yearly                                   |

**First month: about $150 to $180. After that: about $80 to $130 per month.**

How the plans map onto the yardstick:

- **20 companies.** Serper’s paid search supplies a specific first page, and the product keeps going until 20 companies are saved.
- **500 companies.** Apollo’s paid database supplies the later pages. Five hundred company names is a small use of that plan when the industry and country are broad.
- **Emails.** Hunter’s 2,000 a month is the ceiling on people we can actually reach, shared by all customers. About one in three companies will have an email. A single user who wants 500 emails will use a large share of that month. Company names at 500 are inexpensive. Emails are the part with a monthly limit.

---

## What you should expect after this is in place

- A user who asks for **20** in a normal market gets **20** companies, usually within about a minute.
- A user who asks for **500** companies in a broad market sees the list fill — 40, then 140, then 500 — over several minutes.
- A user who asks for **500** in a tiny niche gets the full market, and the screen says there are no more matches. That is a finished search, not a failed one.
- Emails show up on the cards after the companies, on about one in three, until that month’s 2,000 are used.
- The chance a generate click feels successful moves from about **3 out of 10** today to about **8 out of 10** for the company list. People we can email stay nearer **6 out of 10**, because the 2,000-email allowance is shared and some companies have no public email.

---

## One point to be clear on before you pay

Buying these three plans is what makes the numbers possible. The free Apollo plan contains no access to the company pages a request for 500 needs, and the free Hunter plan contains 50 emails a month.

Those plans have to be **used until the count is reached.** If we pay and still run one short search and stop, a request for 20 will still come back as a handful, and a request for 500 will still be impossible. The approved way to spend this money is: take the next page, from the paid search and the paid database, until the saved list equals the number the user asked for, or until that market has no more matching companies.

That is the whole plan. The success measure is the number on the request.
