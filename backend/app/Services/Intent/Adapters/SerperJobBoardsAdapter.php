<?php

namespace App\Services\Intent\Adapters;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Job postings on public job boards, for the Hiring / Job Post signal. Only hiring-type
 * queries are routed here (see SocialListeningOrchestrator::HIRING_SIGNAL_KEYS).
 */
class SerperJobBoardsAdapter extends AbstractSerperSocialAdapter
{
    public const KEY = 'job_boards';

    public function activatesWhenConfigured(): bool
    {
        return true;
    }

    public function isEnabled(IcpBrief $brief, array $enabledSources): bool
    {
        return $this->isConfigured();
    }

    protected function sourceKey(): string
    {
        return self::KEY;
    }

    protected function platform(): string
    {
        return 'jobs';
    }

    protected function sourceLabel(): string
    {
        return 'Job post';
    }

    protected function sourceIcon(): string
    {
        return 'jobs';
    }

    protected function siteFilters(): array
    {
        return [
            'linkedin.com/jobs/view',
            'jobberman.com',
            'myjobmag.com',
            'brightermonday.co.ke',
            'careers24.com',
            'pnet.co.za',
            'indeed.com',
            'glassdoor.com/job-listing',
        ];
    }
}
