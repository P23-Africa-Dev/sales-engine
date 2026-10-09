<?php

namespace Database\Seeders;

use App\Models\SignalTypeDefinition;
use Illuminate\Database\Seeder;

/**
 * Seeds the built-in signal-type registry from new_plan.md's Stage 2 spec.
 *
 * Per the spec's own closing point — "the architecture does not change per
 * client, only the signal-type definitions in Stage 2 change" — new verticals
 * are added here as data (rows), not as new orchestrator code. `pack` groups
 * a vertical's signal types so an ICP can opt into one (see IcpConfig's
 * planned `signalTypePacks` field on the frontend side).
 *
 * organization_id is left null for every row here: these are global/system
 * defaults available to every organization, not an org-specific override.
 */
class SignalTypeDefinitionSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->definitions() as $definition) {
            SignalTypeDefinition::query()->updateOrCreate(
                ['organization_id' => null, 'key' => $definition['key']],
                $definition,
            );
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function definitions(): array
    {
        return [
            // --- Default pack: new_plan.md's core Africa-market-entry example types ---
            [
                'key' => 'new_market_entry',
                'label' => 'New Market Entry',
                'trigger_description' => 'Company announces opening an office, subsidiary, warehouse, or local operation '
                    . 'in a territory it was not previously operating in.',
                'example_valid' => 'Company X registers Kenyan subsidiary to begin local distribution (dated, named source).',
                'example_invalid' => "Company X's Q3 profits rose 12% partly due to African markets — this is a performance "
                    . 'story, not an entry event; reject.',
                'pack' => SignalTypeDefinition::PACK_DEFAULT,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'distribution_partnership_announcement',
                'label' => 'Distribution/Partnership Announcement',
                'trigger_description' => 'A press release or news article naming a new distributor, agent, or partner '
                    . 'relationship in a target territory. Must include the two named parties and the date.',
                'example_valid' => '"Company X appoints Company Y as exclusive distributor in Nigeria" (dated, both parties named).',
                'example_invalid' => 'A vague industry roundup mentioning "several new partnerships forming in the region" '
                    . 'with no named parties — reject.',
                'pack' => SignalTypeDefinition::PACK_DEFAULT,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'leadership_hire_in_territory',
                'label' => 'Leadership Hire in Territory',
                'trigger_description' => 'A named individual is hired or appointed into a country-manager, regional-director, '
                    . 'or similar territory-specific role. This signal type directly feeds enrichment, since it already '
                    . 'gives a named person.',
                'example_valid' => '"Jane Doe appointed Country Manager for Kenya at Company X" (named person, dated).',
                'example_invalid' => 'A job posting for the role with no confirmed hire yet — that is an open-role signal, '
                    . 'not a completed hire; reject here (see the software-dev vertical\'s open-roles signal type instead).',
                'pack' => SignalTypeDefinition::PACK_DEFAULT,
                'feeds_enrichment' => true,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'export_trade_activity_mention',
                'label' => 'Export/Trade Activity Mention',
                'trigger_description' => 'A company is named starting or scaling export activity into or out of a target '
                    . 'territory. Must be scoped to the correct territory direction (e.g. into Africa, not out of it to an '
                    . 'unrelated market) or explicitly excluded.',
                'example_valid' => '"Company X begins exporting processed foods to Ghana" (dated, correct direction).',
                'example_invalid' => 'A company exporting into an unrelated territory outside the ICP\'s target direction — reject.',
                'pack' => SignalTypeDefinition::PACK_DEFAULT,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],

            // --- Case Study 1: software development company targeting UK/US businesses ---
            [
                'key' => 'engineering_team_disruption',
                'label' => 'Engineering Team Disruption',
                'trigger_description' => 'News of engineering leadership departure (CTO/VP Eng leaving), layoffs affecting '
                    . 'the engineering team, or a company shutting down an internal dev team.',
                'example_valid' => '"Company X lays off internal engineering team, cites cost-cutting" (dated, sourced).',
                'example_invalid' => 'A generic listicle "Top layoffs of 2026" with no single named company event — reject.',
                'pack' => SignalTypeDefinition::PACK_SOFTWARE_DEV,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'public_complaints_about_software_quality',
                'label' => 'Public Complaints About Software/App Quality',
                'trigger_description' => 'App store reviews, social media posts, or forum threads naming a specific company '
                    . 'and describing bugs, crashes, downtime, or a broken product experience. Must capture company name, '
                    . 'platform/product named, and the complaint\'s date.',
                'example_valid' => 'A dated post naming Company X\'s app as "constantly crashing since the last update."',
                'example_invalid' => 'Vague industry commentary like "so many apps are buggy these days" with no named company — reject.',
                'pack' => SignalTypeDefinition::PACK_SOFTWARE_DEV,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 90,
                'active' => true,
            ],
            [
                'key' => 'technical_incident_outage_coverage',
                'label' => 'Technical Incident / Outage Coverage',
                'trigger_description' => 'News articles reporting a company\'s website, app, or system outage, or a data '
                    . 'breach tied to technical infrastructure — a stronger signal than a complaint since it is '
                    . 'independently reported, not just user sentiment.',
                'example_valid' => '"Company X website down for six hours, customers report checkout failures" (dated, sourced).',
                'example_invalid' => 'A rumor with no corroborating news coverage — reject.',
                'pack' => SignalTypeDefinition::PACK_SOFTWARE_DEV,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 90,
                'active' => true,
            ],
            [
                'key' => 'open_developer_roles_unfilled',
                'label' => 'Open Developer Roles Left Unfilled',
                'trigger_description' => 'A job posting for developer roles that has been live for an extended period '
                    . '(e.g. 60+ days) without being taken down, suggesting difficulty hiring in-house. Requires tracking '
                    . 'job-posting duration, not just a single scrape.',
                'example_valid' => 'A developer job posting first seen 65+ days ago and still live today.',
                'example_invalid' => 'A job posting seen only once, with no way to confirm how long it has been open — reject '
                    . 'until duration can be established.',
                'pack' => SignalTypeDefinition::PACK_SOFTWARE_DEV,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 90,
                'active' => true,
            ],
            [
                'key' => 'digital_transformation_announcement',
                'label' => 'Digital Transformation / Tech Modernization Announcement',
                'trigger_description' => 'A company publicly announces a plan to modernize legacy systems, migrate '
                    . 'platforms, or launch a new digital product — signals upcoming build work, whether in-house or outsourced.',
                'example_valid' => '"Company X announces $2M investment to modernize its legacy claims platform" (dated, sourced).',
                'example_invalid' => 'A generic op-ed about "the future of digital transformation" with no named company — reject.',
                'pack' => SignalTypeDefinition::PACK_SOFTWARE_DEV,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],

            // --- Case Study 2: Lagos corporate car service targeting expat-facing organizations ---
            [
                'key' => 'new_embassy_consulate_presence',
                'label' => 'New Embassy/Consulate Presence or Expansion',
                'trigger_description' => 'A country announces opening a new embassy or consulate in Lagos, or an existing '
                    . 'mission announces staff expansion.',
                'example_valid' => '"Country X opens new consulate in Lagos, appoints staff" (dated, sourced).',
                'example_invalid' => 'A diplomatic visit or one-off meeting with no permanent presence announced — reject.',
                'pack' => SignalTypeDefinition::PACK_LAGOS_CORPORATE_TRANSPORT,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'foreign_company_market_entry_lagos',
                'label' => 'Foreign Company Market Entry (Lagos)',
                'trigger_description' => 'Same trigger as New Market Entry, scoped specifically to Lagos — a foreign '
                    . 'company announcing a new office or operation there. Reuses the default pack\'s new_market_entry '
                    . 'logic; only the territory filter differs.',
                'example_valid' => '"Company X opens new Lagos office to serve West African clients" (dated, sourced).',
                'example_invalid' => 'A market-entry story about a different country — reject (wrong territory).',
                'pack' => SignalTypeDefinition::PACK_LAGOS_CORPORATE_TRANSPORT,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'expat_relocation_activity',
                'label' => 'Expat Relocation Activity',
                'trigger_description' => 'A relocation services company, HR firm, or multinational announces relocating '
                    . 'staff or expats into Lagos, or a news article discusses an increase in expat arrivals tied to a '
                    . 'specific company or sector. Must be scoped to inbound movement into Lagos, not general expat commentary.',
                'example_valid' => '"Company X relocates 12 expat staff to its new Lagos office" (dated, sourced).',
                'example_invalid' => 'General commentary on expat life in Lagos with no named company or move — reject.',
                'pack' => SignalTypeDefinition::PACK_LAGOS_CORPORATE_TRANSPORT,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'diplomatic_corporate_hiring_lagos',
                'label' => 'Diplomatic or Corporate Hiring for Lagos-Based Roles',
                'trigger_description' => 'A job posting for a "country manager," "Lagos office lead," "expat liaison," or '
                    . 'similar role based in Lagos — this often precedes an actual person arriving and needing transport '
                    . 'arrangements. Reuses the default pack\'s Leadership Hire in Territory signal type, scoped to Lagos.',
                'example_valid' => 'A confirmed hire announcement for a Lagos-based country-manager role (named person, dated).',
                'example_invalid' => 'An open job posting with no confirmed hire yet — treat as a weaker, unconfirmed signal.',
                'pack' => SignalTypeDefinition::PACK_LAGOS_CORPORATE_TRANSPORT,
                'feeds_enrichment' => true,
                'default_recency_window_days' => 180,
                'active' => true,
            ],
            [
                'key' => 'complaints_about_transport_providers',
                'label' => 'Complaints About Current Transport/Logistics Providers',
                'trigger_description' => 'Social posts or reviews from a named organization or its staff describing '
                    . 'unreliable corporate transport, missed pickups, or safety concerns with a current provider. Weaker '
                    . 'signal on its own — best combined with an ICP match rather than used standalone.',
                'example_valid' => 'A dated post from a named organization\'s staff describing repeated missed pickups by their current provider.',
                'example_invalid' => 'An anonymous complaint with no organization named — reject.',
                'pack' => SignalTypeDefinition::PACK_LAGOS_CORPORATE_TRANSPORT,
                'feeds_enrichment' => false,
                'default_recency_window_days' => 90,
                'active' => true,
            ],
        ];
    }
}
