# Sales Engine - Product Overview

## 1. What is the product supposed to do?

The Sales Engine should help businesses answer three questions:

1. Which companies should we be targeting?
2. What has happened recently that makes these companies potential customers?
3. Who are the right people to contact within those companies?

Rather than manually searching the internet, researching companies and looking for decision-makers, the system uses AI and data sources to automate much of this work.

## 2. The three major things the product must do

### 1. ICP Filter — Define the right companies

The user defines the type of company they want to find.

**Example:** Manufacturing companies in Germany, Netherlands and Sweden, with 100–500 employees, targeting Africa.

### 2. Signal Detection — Find relevant business events

The system searches for specific, recent events involving companies that could create a business opportunity.

**Example:** A German manufacturing company announces plans to open a distribution office in Nigeria.

### 3. Enrichment — Find the right people to contact

Once a relevant company or person is identified, the system looks up additional contact information.

**Example:** Finds the company's Head of Procurement, their verified email and LinkedIn profile.

## 3. What features should each section have?

| Module                 | Required features                                                                 | Expected outcome                                              |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ICP Filter             | Industry, company size, annual revenue, territory, target job roles               | Defines the companies and people that qualify.                |
| Signal Detection       | Signal type selection, source monitoring, event detection, company identification | Find relevant business opportunities.                         |
| Signal Validation      | Source URL verification, publication date, recency checks, event verification     | Ensures results are real, recent and verifiable.              |
| Company Identification | Company name, location, territory, event description                              | Identifies the business behind the signal.                    |
| People Identification  | Named individuals, job titles, leadership appointments                            | Identifies relevant people associated with the event.         |
| Contact Enrichment     | Email lookup, LinkedIn lookup, role-based contact search                          | Provides actionable contact information.                      |
| Lead Management        | Save results, company-level leads, contact status                                 | Keeps discovered opportunities available for sales follow-up. |

## 4. What types of opportunities should it find?

The document gives specific examples of business events the system should recognize.

| Signal type                | What the system should look for                                | Example                                                      |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| New Market Entry           | Companies entering a new geographical market                   | A German company opens a subsidiary in Kenya.                |
| Distribution / Partnership | New distributor, agent or business partnership announcements   | A manufacturer appoints a Nigerian distributor.              |
| Leadership Hire            | Appointment of new regional or country-level executives        | A company hires a new Country Manager for Africa.            |
| Export / Trade Activity    | Companies starting or increasing trade into a target territory | A European manufacturer begins exporting machinery to Ghana. |
| Hiring / Job Post          | Finding new individuals for their area of specialization       | —                                                            |

The document also provides examples for other industries, such as software development and corporate transport. The important point is that the system should be adaptable to different business types.

## 5. How should the complete product work?

Let's use a practical example.

Imagine a company that manufactures industrial equipment and wants to find businesses expanding into Africa.

### Example: Finding a sales opportunity

1. **User defines the target customer**
   - Industry: Industrial Manufacturing
   - Location: Germany, Netherlands
   - Target territory: Africa
   - Company size: 100–500 employees
   - Target roles: Head of Sales, Export Director

2. **System searches for business signals**  
   Finds a published announcement that ABC Manufacturing is opening a distribution operation in Kenya.

3. **System validates the signal**  
   Checks that the company is named, the event is relevant, the source URL exists and the publication date is within the allowed period.

4. **System checks the ICP**  
   Determines whether ABC Manufacturing meets the user's industry, size and geographical requirements.

5. **System enriches the company**  
   Looks for the Export Director or Head of Sales and retrieves available professional contact information.

6. **System produces a sales-ready record**
   - **Company:** ABC Manufacturing
   - **ICP:** Qualified
   - **Signal:** NEW MARKET ENTRY
   - **Detail:** Announced a new distribution operation in Kenya.
   - **Contact:** John Smith
   - **Role:** Export Director
   - **Email:** Verified email, if available
   - **LinkedIn:** Professional profile, if available
   - **Source:** Original announcement URL
   - **Signal Date:** 12 October 2026

   If no contact is found, save the company as a lead and flag it as "No contact found".

## 6. Important rules the developers must implement

These are not optional enhancements. They are important requirements in the Product Owner's document.

| Requirement                                            | Expected system behaviour                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| No source URL                                          | Discard the signal.                                                             |
| No publication date                                    | Discard the signal.                                                             |
| Signal outside the recency window                      | Reject the signal.                                                              |
| Company does not match ICP                             | Do not qualify it.                                                              |
| General industry news without a specific company event | Reject it.                                                                      |
| Event does not match the selected signal type          | Reject it.                                                                      |
| No named person available                              | Continue with company-level lead.                                               |
| No enriched contact found                              | Save record with "No contact found" status.                                     |
| Different client or industry                           | Reuse the same architecture but change the signal definitions and ICP criteria. |

## 7. What is the final product expected to deliver?

At the end of the process, the user should not just receive a collection of internet search results.

They should receive a structured list of verified, ICP-qualified business opportunities with relevant company information and available contact details.

The final output should look something like this:

| Company              | Signal                   | Territory | ICP Status | Contact        | Contact Status   |
| -------------------- | ------------------------ | --------- | ---------- | -------------- | ---------------- |
| ABC Manufacturing    | New Market Entry         | Kenya     | Qualified  | John Smith     | Enriched         |
| Global Equipment Ltd | Distribution Partnership | Nigeria   | Qualified  | Sarah James    | Enriched         |
| TechWorks GmbH       | Leadership Hire          | Ghana     | Qualified  | Not identified | No contact found |

## My final interpretation

The Product Owner is not simply asking for a social media monitoring tool or another lead-generation search engine.

The intended product is a system that:

- Defines the type of companies a business wants to sell to.
- Finds recent business events that could create sales opportunities.
- Verifies those events using actual sources and dates.
- Filters the discovered companies against the target customer profile.
- Identifies relevant people within those companies.
- Enriches those people with professional contact information.
- Produces structured, actionable company and contact records.

The entire product can be summarized in one sentence:

> Build an AI-powered system that discovers companies experiencing relevant business developments, verifies those developments, checks whether the companies match a user's target customer profile, and finds the right decision-makers and contact information to help the sales team pursue those opportunities.

One important distinction: The Product Owner's document primarily specifies the discovery, filtering, validation and enrichment process. It does not fully specify automated outreach, CRM pipeline management or the advanced social-listening scoring system. Those can be connected to the Sales Engine, but should be treated as additional requirements rather than assumed to be part of this particular specification.
