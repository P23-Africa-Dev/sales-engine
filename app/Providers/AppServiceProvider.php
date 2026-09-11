<?php

namespace App\Providers;

use App\Services\Discovery\Adapters\ApolloDiscoveryAdapter;
use App\Services\Discovery\Adapters\FylingsDiscoveryAdapter;
use App\Services\Discovery\Adapters\HunterDiscoveryAdapter;
use App\Services\Discovery\Adapters\MetaPagesDiscoveryAdapter;
use App\Services\Discovery\Adapters\MonoDiscoveryAdapter;
use App\Services\Discovery\Adapters\RedditDiscoveryAdapter;
use App\Services\Discovery\Adapters\SerperDiscoveryAdapter;
use App\Services\Discovery\Adapters\XDiscoveryAdapter;
use App\Services\Discovery\Adapters\YoutubeDiscoveryAdapter;
use App\Services\Discovery\DiscoveryOrchestrator;
use App\Services\Research\ResearchOrchestrator;
use App\Services\CompanyCache\CompanyCacheService;
use App\Services\Extraction\ExtractionService;
use App\Services\Scoring\ScoringService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(DiscoveryOrchestrator::class, function ($app) {
            return new DiscoveryOrchestrator(
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
                cache: $app->make(CompanyCacheService::class),
                extraction: $app->make(ExtractionService::class),
                scoring: $app->make(ScoringService::class),
                queryIntent: $app->make(\App\Services\Discovery\QueryIntentService::class),
                personNameValidator: $app->make(\App\Services\Discovery\PersonNameValidator::class),
                companyNameValidator: $app->make(\App\Services\Discovery\CompanyNameValidator::class),
                factualListSynthesizer: $app->make(\App\Services\Discovery\FactualListSynthesizer::class),
                enrichment: $app->make(\App\Services\Enrichment\LeadProfileEnrichmentService::class),
                queryVariationGenerator: $app->make(\App\Services\Discovery\QueryVariationGenerator::class),
                profileUrlValidator: $app->make(\App\Services\Enrichment\ProfileUrlValidator::class),
                leadQueryNormalizer: $app->make(\App\Services\Discovery\LeadQueryNormalizer::class),
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
                glm: $app->make(\App\Services\Llm\GlmClient::class),
                icpChatContext: $app->make(\App\Services\Chat\IcpChatContextBuilder::class),
            );
        });

        $this->app->singleton(\App\Services\Intent\SocialListeningOrchestrator::class, function ($app) {
            return new \App\Services\Intent\SocialListeningOrchestrator(
                sources: [
                    $app->make(\App\Services\Intent\Adapters\SerperLinkedInAdapter::class),
                    $app->make(\App\Services\Intent\Adapters\SerperXAdapter::class),
                    $app->make(\App\Services\Intent\Adapters\SerperRedditAdapter::class),
                    $app->make(\App\Services\Intent\Adapters\SerperMetaAdapter::class),
                    $app->make(\App\Services\Intent\Adapters\MetaGraphPagesAdapter::class),
                ],
                enricher: $app->make(\App\Services\Intent\SocialSignalEnricher::class),
                glm: $app->make(\App\Services\Llm\GlmClient::class),
            );
        });
    }

    public function boot(): void
    {
        //
    }
}
