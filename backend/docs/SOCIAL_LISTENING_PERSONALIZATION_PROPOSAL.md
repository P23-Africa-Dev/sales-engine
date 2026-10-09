# Making Social Listening Feel Personal — A Proposal

*For: Product. No code or engineering detail below — this is about what changes for the user and why it matters.*

## The problem in one sentence

Right now, Social Listening finds people online who might want to buy something — it does not yet tell *our* user why any of that matters to *them*, personally, based on what they actually care about.

## What Social Listening does today

Think of it as a scout. Every so often, it goes out onto the internet — LinkedIn, X, Reddit, Google — and looks for people posting things like "does anyone know a good tool for X" or "we're switching away from our current vendor." When it finds one, an AI reads the post and writes up a little dossier: who this person is, what company they're at, how urgent their need seems, and a drafted message our user could send them.

That's useful, but it's built around one specific job: help our user sell Factory 23 Sales Engine to somebody. The scout is only ever looking for "someone who might buy software," and the write-up is only ever framed as "here's how you pitch this person."

## The problem with that

Our users aren't only sales reps hunting for buyers. Some of them have much broader interests — market opportunities, investment leads, competitive moves, partnership openings, industry shifts. Right now, if the scout stumbles onto something like "Tesla just opened a major investment round in a new market," it either throws that away or awkwardly tries to force it into a "this person wants to buy software" shape — because that's the only shape it knows how to produce.

Worse, even for the things it does surface correctly today, it never says *why this specific thing matters to this specific user*. It hands over a raw finding and expects the user to figure out the relevance themselves. That's the opposite of what a good personal assistant does.

## The vision

Social Listening should work like a sharp personal assistant who knows exactly what you care about — not a generic news scraper. Every single thing it surfaces should come with three things attached, every time:

1. **Why this matters to you** — plainly stated, referencing what you told us you're interested in. Not "here's a post," but "based on your interest in X, here's why this is worth your attention."
2. **What you stand to gain** — the concrete upside. Early visibility, a benchmark, an opportunity window, a competitive edge — spelled out, not implied.
3. **What to do next** — a clear, specific recommended action, tailored to the type of opportunity (not a generic "reach out to this person" template).

Using the example from earlier: if a user has told us they're interested in tech-market investment opportunities abroad, and the scout finds that a major tech company just opened a high-conviction investment round, the write-up shouldn't just say "Tesla opened an investment round." It should say something like:

> *"Based on your stated interest in tech-market investments outside your home market, this is a strong fit — Tesla's new investment round shows [specific reason it's a strong opportunity]. This could give you [specific benefit — e.g. early entry, a benchmark for comparable deals]. Recommended next step: [specific, concrete action]."*

That's the bar every surfaced item should meet, whatever kind of opportunity it is — a sales lead, an investment, a partnership, a market shift.

## Why this matters for the business

- **Retention and trust.** A tool that explains *why it's showing you this* feels like it understands you. A tool that dumps raw findings on you feels like search results — easy to ignore, easy to churn away from.
- **Broader addressable use case.** Today Social Listening only makes sense for users doing outbound sales. Reframing it as a personalized opportunity assistant opens it up to any user with a clearly defined interest — investors, market researchers, business development, competitive intelligence — without needing a separate product.
- **Differentiation.** "Finds leads" is table stakes and easy to copy. "Understands what matters to you specifically and tells you why" is a much harder thing for a competitor to replicate well, because it depends on doing the personalization step properly.

## What has to change to get there

1. **The scout needs to search more broadly.** Right now it's told, in effect, "only look for people trying to buy software." That instruction needs to loosen so it can also catch things like funding news, market shifts, and partnership signals — guided by what the specific user says they care about.
2. **We need a clear place for the user to tell us what they care about.** Today, the system mostly assumes "you're a company that wants sales leads." We need an explicit, first-class way for a user to say "actually, what I want to be alerted to is ___" — and everything downstream (the search, the write-up) should be driven by that statement.
3. **The write-up step needs a rewrite.** Instead of only producing a sales-outreach dossier, it needs to also produce the "why this matters to you / what you gain / what to do next" framing described above, tailored to whatever the user said they care about.
4. **Relevance scoring needs to reflect the user's actual stated interest**, not just generic industry/location keyword matching. A near-perfect match to what the user explicitly asked for should always outrank a loose industry match that happens to score well on paper.

## What this does *not* have to break

This is additive, not a rebuild. Users who only want the existing sales-outreach behavior should be able to keep getting exactly that. The personalization layer sits on top of the existing scouting and write-up steps — it's a richer way of explaining what's already being found, plus a wider net for what counts as worth finding, driven by what each user actually asks for.

## Open questions for Product

1. **Is there already a place in the product where a user states what they want Social Listening to watch for?** If there's an existing screen or step where the user previews or configures "what kind of things will I see," the new personalization work should build on that rather than create a second, separate place to say the same thing.
2. **Should this personalized-assistant framing be a mode users opt into, or should it just become how Social Listening always behaves?** E.g., a toggle between "sales outreach mode" and "personal opportunity mode," versus one unified experience for everyone.
3. **Do we need real example users/interests to design against before this gets scoped?** A sales-focused example and a non-sales example (like the investment scenario) would help make sure the new write-ups genuinely adapt to different kinds of users, not just sales reps with different wording.

## Suggested next step

Once Product has a view on the three questions above, this can be turned into a scoped engineering plan — what changes where, in what order, and what a user will concretely see differently on day one versus what ships later.
