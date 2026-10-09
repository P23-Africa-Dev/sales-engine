# Why Sales Engine returns so few leads

**Who this is for:** the CEO, the board, and the project manager.  
**Date:** 25 September 2026  
**What we did:** we read the Sales Engine backend. No product code was changed.

---

## The short version

People are asking for **at least 50 companies**. The product often returns **one, three, or five**, and sometimes **none**. Many of those cards show a **website and no email or phone**.

This is not because the team “typed the wrong sentence” in a casual sense. The product is built to do five things that fight a request for 50 real contacts:

1. It **shortens long descriptions** before it searches the web.
2. It only **really knows how to search a handful of countries**, mostly in Africa plus the UK, the US, and India.
3. It **throws away** companies it can tell are in the wrong country.
4. It **stops early** (about two and a half minutes) and only looks at a small pile of web results.
5. On that first pass it **does not go and find email or phone numbers**. It keeps the website.

African countries sometimes work because **Nigeria, Ghana, Kenya, South Africa, and Egypt are built in**. Germany, the Netherlands, and Denmark are **not**.

---

## What people think they are asking for

In the ICP builder there is a box: **“What kind of opportunity are you looking for?”**

A typical ask looks like this:

> Manufactures (not just resells) equipment in one of these categories: HVAC, construction machinery, power generation, solar, agricultural machinery, industrial machinery, or material handling.

They also pick countries (for example Germany, the Netherlands, Denmark) and click something like **“50 prospects with my ICP.”**

They expect 50 manufacturers in those countries, with a way to contact them.

---

## Problem 1 — A long sentence is not what gets searched

The box can hold a long paragraph. The preview even repeats that whole paragraph and says “when you ask for leads, we will search this.”

**That preview is not what Google is given.**

If the sentence is longer than about **14 words**, the engine compresses it. The actual web search is then only about **the first 10 words**, or a few leftover nouns such as “equipment” and “machinery.”

So both of these fail for the same reason:

- the careful sentence with “manufactures, not just resells” and seven equipment categories
- the same idea written as one long run-on line

The engine treats them as an essay, not as a search. It also cannot obey “not a reseller.” The web does not filter that way, and we do not have a field that says “this company builds the machine; it does not only sell it.”

**What works better today:** a short phrase, one product family at a time.  
Example: `HVAC refrigeration equipment manufacturers`  
Not: a paragraph that lists every category and an exclusion.

The “Generate / Improve” button is also told to write only **6 to 12 words**, and to leave countries out. A long, precise brief will be rewritten into something shorter and vaguer.

---

## Problem 2 — We cannot properly fetch leads outside a small country list

The engine has a **built-in country book**. Only these markets get the full treatment (search aimed at that country, company databases filtered to that country, and “this website looks local”):

- Nigeria
- Ghana
- Kenya
- South Africa
- Egypt
- United Kingdom
- United States
- India

**Germany, the Netherlands, Denmark, Sweden, and most of the rest of the world are not in that book.**

For a country in the book (Nigeria is the strongest example) the product:

- adds the country name to the search
- asks the search engine to prefer that country
- asks the company database for headquarters in that country
- recognises local web addresses (for example a `.ng` site)

For Germany it mostly **does not**. It may stick the word “Germany” on the end of a shortened sentence, then **delete** any company it can see is somewhere else. German sites (`.de`) are **not** recognised as German. So a real German manufacturer often looks like “country unknown” and is kept only weakly, or never found, because the search itself was not aimed at Germany.

If several European countries are selected, **only the first one** is added to the search. The others are used later as a reject list.

There is also a spelling trap: the product sometimes stores **“Netherland”** (missing the s). A real Dutch company that says **“Netherlands”** may be rejected as the wrong country.

**Why Africa sometimes works:** Nigeria, Ghana, Kenya, South Africa, and Egypt are in the book. A search with Nigeria in the location list is actually aimed at Nigeria, so more companies survive. That is why adding Nigeria suddenly produces more cards. Those extra cards are Nigerian (or labelled Nigeria). They are not proof that the European search got better.

**Why it is only “sometimes” even in Africa:** the sentence still has to be short and concrete, the industry chips still have to match, and the clock still stops the run. A vague sentence plus Nigeria can still return very little.

---

## Problem 3 — We asked for 50 and got 1, 3, or 5

Several limits stack on top of each other.

- If nobody types a number, the first batch is **12**, not 50.
- Each web search only brings back about **10 to 20** pages, not 50 companies.
- The run is designed to **stop at about 90 seconds** for a first look, and **give up at about 2.5 minutes**.
- For a request of 50, it will only try to process roughly **75** raw web hits, then throw most of them away.
- Anything clearly in another country is **deleted**.
- If industry, company size, or revenue was selected, a company with **no data** for that field can be **deleted** too.
- Articles, “top 10” lists, and job pages are thrown out. That is correct for quality, but it shrinks the pile.

After all of that, one to five survivors is a normal outcome. It is not a random glitch.

The empty message you see — “No leads in Germany, Netherland, Denmark met your ICP search brief” — means: we searched, then **the country filter removed what was left**.

---

## Problem 4 — Cards show a website, not a person you can call

On the first generate, contact lookup is **turned off on purpose**.

The product saves whatever was already on the web page: often a **company website**, sometimes a LinkedIn link. It does **not**, on that first pass, run the extra search that finds a named person, an email, or a phone number.

So a “lead” can be a legitimate company with **no contact details yet**. That is a speed choice, not proof that the company has no email. A later enrichment step is supposed to fill contacts. If that step does not run, or the page never published an email, the card stays as a website.

---

## What this means for the business

Sales Engine can look capable in **Nigeria and a few other built-in markets**, with a **short product phrase**, and still fail a European manufacturer search that is written as a **long definition** and asks for **50 contacts**.

The gap is in how we search and how we stop — not in the customer’s expectation being unreasonable.

---

## What we should change

In plain terms, in this order:

1. **Search the country we were given.** Germany, the Netherlands, and Denmark need the same treatment Nigeria already has: aim the search there, accept local websites as local, and do not misspell Netherlands.
2. **Show the real search**, not the full paragraph. If we only search ten words, the screen should say those ten words.
3. **Do not pretend a long definition is a search.** Either keep the definition for humans and search a short phrase, or stop cutting the phrase so aggressively.
4. **If someone asks for 50, plan for 50.** That means more than one page of results, more than two minutes, and not deleting the whole list because size or revenue was blank.
5. **Separate “company found” from “contact found.”** Say clearly when we only have a website, and run contact lookup after the list exists instead of skipping it silently.

Until those are in place, the practical workaround is: one short product phrase, one country that is already supported (or accept thin results in Europe), and do not expect 50 emails from the first click.
