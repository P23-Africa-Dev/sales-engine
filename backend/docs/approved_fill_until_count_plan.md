# Approved plan: return the number of leads the user asked for

**Status:** approved  
**Date:** 28 September 2026  
**For:** the owner, and the people who will build it  
**Replaces, as the spending decision:** the idea of paying for Serper, Hunter, and Apollo only to move a month from about 594 leads to about 800. That gap is too small for the cost. This plan is the one that was approved.

---

## The decision

Users complain that a request does not come back with the number they asked for. The product causes that. It searches once, for a short time, and stops. A paid plan on top of that short search adds companies, and it does not turn “give me 500” into 500.

The approved plan is:

1. **Keep searching until the saved list equals the number the user asked for**, or until the sources have no more companies that match. Say which of those two happened.
2. **Show results as they arrive.** The first companies appear quickly. A large request keeps filling in the background: “140 of 500 — still searching.”
3. **Use a company database for large numbers.** Web search fills a small request. A database is what contains the next hundred companies, then the hundred after that.
4. **Add emails after the company is saved**, and only up to the monthly email allowance.

A narrow market can still be smaller than the number typed. The product then returns the whole market and says so. It does not stop at a handful while more matches are still available.

---

## What the user will get

| What they ask for                             | What happens today                                                                              | What this plan delivers                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 20 companies in a real market                 | Often a handful. A click with no number only aims at 12                                         | **20 companies**                                                                                            |
| 500 companies in a broad industry and country | Impossible. Any number above 150 is cut to 150, and the search still stops after one short pass | **500 companies**, filling over several minutes, when the database contains them                            |
| 500 companies in a very small niche           | A short list, with no clear reason                                                              | **The real market size**, for example 60, with a clear stop: there are no more matches                      |
| Emails on those companies                     | About **4%** of saved leads have an email (24 of 594 in the last 30 days)                       | Emails on roughly **one in three** companies, until the monthly allowance of **2,000** found emails is used |

The chance that a generate click feels successful moves from about **3 out of 10** today to about **8 out of 10** for company lists. Contactable people stay nearer **6 out of 10**, because many companies have no public email and the email allowance is shared by every customer.

---

## Why the current product cannot do this, even after a payment

These limits are in the running product. Paying Serper, Hunter, and Apollo does not remove them.

- A request with no number searches for **12** leads.
- A request for **500** is stored as **150** before the search starts.
- Each wave runs at most **12** web searches. The free search plan returns at most **10** results per search, and it refuses the more specific searches.
- The run stops at about **2.5 minutes**. It may try three extra waves, and only when the clock cut it off. A run that finishes on time with too few leads does not continue.
- The search does not ask for page 2. The company-database search that would return the next page is not built. Apollo’s people search is on the free plan, which blocks that API.
- Email lookup is skipped on the first pass. In the last 30 days, **42 of 594** leads had an email or a phone.

That is why the same month of use would move from **594** leads to roughly **800 to 1,200** if we only paid. The approved plan changes the stopping rule, so one request can reach the number that was typed.

---

## How a request will run

1. Read the number the user typed, including numbers above 150. If they type no number, keep a modest default and show it.
2. Return the first matching companies in the first minute.
3. While the saved count is below the number:
    - take the next page of web results for a small remaining gap
    - take the next page of the company database for a large remaining gap
    - drop duplicates, the wrong country, and pages that are articles
4. Stop when the count is reached, or when the next page adds nothing that matches. The screen states that stop in plain words.
5. For each saved company that still has no email, look up the email in the background, until the monthly email allowance is spent.

Twenty companies should complete in about a minute in a normal market. Five hundred companies should keep filling for several minutes, with the count visible the whole time.

---

## What to pay, and what to leave

| Item                                                       | Decision                             | Cost                                                                            | What it is for                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Serper**, 50,000-credit pack                             | **Approve**                          | **$50 once** (credits last for months and expire about 6 months after purchase) | The first pages of web search stay specific, and the account stops hitting “not enough credits.” This pack does not, by itself, produce 500 leads |
| **Apollo**, lowest paid seat that includes the API         | **Approve with the database paging** | **About $49 to $79 per month** for one seat. Use the price on Apollo’s screen   | The pages of companies that make a request for 100 or 500 possible. The free plan blocks this search                                              |
| **Hunter Starter**                                         | **Approve for emails**               | **$49 per month**, or **$34 per month** billed yearly                           | **2,000** found emails per month, shared by all customers. Company search on Hunter is already free                                               |
| YouTube, Reddit, Meta, SendGrid, and the other unused APIs | **Do not buy** for this goal         | —                                                                               | They are not what stops a list at the wrong size                                                                                                  |

**First month: about $150 to $180. After that: about $80 to $130 per month.**

One user who asks for 500 emails can use a large part of the 2,000-email month. Company names at that size are cheap. Emails are the metered part, and the allowance is the limit, not an unlimited button.

---

## What “done” means

- A user who asks for 20 companies in a real market gets 20, or a clear message that the market is smaller than 20.
- A user who asks for 500 companies in a broad market gets 500 company records, with the count climbing until it arrives.
- A user who asks for 500 companies in a tiny niche gets the full set that exists, and the screen says the search is finished because nothing more matches.
- Emails appear on the cards after the companies, at roughly one in three companies, until that month’s 2,000 found emails are used.
- A month of ordinary use is no longer the success measure. The success measure is the number on the request.
