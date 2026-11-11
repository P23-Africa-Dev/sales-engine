<?php

namespace App\Providers;

use App\Services\Chat\IcpChatContextBuilder;
use App\Services\CompanyCache\CompanyCacheService;
use App\Services\Discovery\Adapters\ApolloDiscoveryAdapter;
use App\Services\Discovery\Adapters\FylingsDiscoveryAdapter;
use App\Services\Discovery\Adapters\HunterDiscoveryAdapter;
use App\Services\Discovery\Adapters\MetaPagesDiscoveryAdapter;
use App\Services\Discovery\Adapters\MonoDiscoveryAdapter;
use App\Services\Discovery\Adapters\RedditDiscoveryAdapter;
use App\Services\Discovery\Adapters\SerperDiscoveryAdapter;
use App\Services\Discovery\Adapters\SerperPlacesDiscoveryAdapter;
use App\Services\Discovery\Adapters\XDiscoveryAdapter;
use App\Services\Discovery\Adapters\YoutubeDiscoveryAdapter;
use App\Services\Discovery\CompanyNameValidator;
use App\Services\Discovery\DiscoveryOrchestrator;
use App\Services\Discovery\DiscoveryProviderHealth;
use App\Services\Discovery\FactualListSynthesizer;
use App\Services\Discovery\LeadQueryNormalizer;
use App\Services\Discovery\PersonNameValidator;
use App\Services\Discovery\QueryIntentService;
use App\Services\Discovery\QueryVariationGenerator;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use App\Services\Enrichment\ProfileUrlValidator;
use App\Services\Extraction\ExtractionService;
use App\Services\Intent\Adapters\MetaGraphPagesAdapter;
use App\Services\Intent\Adapters\RedditNativeSocialAdapter;
use App\Services\Intent\Adapters\SerperLinkedInAdapter;
use App\Services\Intent\Adapters\SerperMetaAdapter;
use App\Services\Intent\Adapters\SerperRedditAdapter;
use App\Services\Intent\Adapters\SerperXAdapter;
use App\Services\Intent\Adapters\XNativeSocialAdapter;
use App\Services\Intent\Adapters\YoutubeSocialAdapter;
use App\Services\Intent\SocialListeningOrchestrator;
use App\Services\Intent\SocialSignalEnricher;
use App\Services\Intent\SocialSourceHealth;
use App\Services\Llm\GlmClient;
use App\Services\Research\ResearchOrchestrator;
use App\Services\Scoring\ScoringService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Shared per-run retrieval health: adapters record, the orchestrator reports.
        $this->app->singleton(DiscoveryProviderHealth::class);
        $this->app->singleton(SocialSourceHealth::class);

        $this->app->singleton(DiscoveryOrchestrator::class, function ($app) {
            return new DiscoveryOrchestrator(
                sources: [
                    $app->make(SerperDiscoveryAdapter::class),
                    $app->make(SerperPlacesDiscoveryAdapter::class),
                    $app->make(MonoDiscoveryAdapter::class),
                    $app->make(FylingsDiscoveryAdapter::class),
                    $app->make(ApolloDiscoveryAdapter::class),
                    $app->make(HunterDiscoveryAdapter::class),
                    $app->make(YoutubeDiscoveryAdapter::class),
                    $app->make(XDiscoveryAdapter::class),
                    $app->make(RedditDiscoveryAdapter::class),
                    $app->make(MetaPagesDiscoveryAdapter::class),
                ],
                cache: $app->make(CompanyCacheService::class),
                extraction: $app->make(ExtractionService::class),
                scoring: $app->make(ScoringService::class),
                queryIntent: $app->make(QueryIntentService::class),
                personNameValidator: $app->make(PersonNameValidator::class),
                companyNameValidator: $app->make(CompanyNameValidator::class),
                factualListSynthesizer: $app->make(FactualListSynthesizer::class),
                enrichment: $app->make(LeadProfileEnrichmentService::class),
                queryVariationGenerator: $app->make(QueryVariationGenerator::class),
                profileUrlValidator: $app->make(ProfileUrlValidator::class),
                leadQueryNormalizer: $app->make(LeadQueryNormalizer::class),
                providerHealth: $app->make(DiscoveryProviderHealth::class),
            );
        });

        $this->app->singleton(ResearchOrchestrator::class, function ($app) {
            return new ResearchOrchestrator(
                sources: [
                    $app->make(SerperDiscoveryAdapter::class),
                    $app->make(MonoDiscoveryAdapter::class),
                    $app->make(FylingsDiscoveryAdapter::class),
                    $app->make(ApolloDiscoveryAdapter::class),
                    $app->make(HunterDiscoveryAdapter::class),
                    $app->make(YoutubeDiscoveryAdapter::class),
                    $app->make(XDiscoveryAdapter::class),
                    $app->make(RedditDiscoveryAdapter::class),
                    $app->make(MetaPagesDiscoveryAdapter::class),
                ],
                glm: $app->make(GlmClient::class),
                icpChatContext: $app->make(IcpChatContextBuilder::class),
            );
        });

        $this->app->singleton(SocialListeningOrchestrator::class, function ($app) {
            return new SocialListeningOrchestrator(
                sources: [
                    $app->make(SerperLinkedInAdapter::class),
                    $app->make(SerperXAdapter::class),
                    $app->make(SerperRedditAdapter::class),
                    $app->make(SerperMetaAdapter::class),
                    $app->make(MetaGraphPagesAdapter::class),
                    $app->make(YoutubeSocialAdapter::class),
                    $app->make(XNativeSocialAdapter::class),
                    $app->make(RedditNativeSocialAdapter::class),
                ],
                enricher: $app->make(SocialSignalEnricher::class),
                glm: $app->make(GlmClient::class),
            );
        });
    }

    public function boot(): void
    {
        //
    }
}
