<?php

namespace App\Services\Intent\Adapters;

class SerperLinkedInAdapter extends AbstractSerperSocialAdapter
{
    protected function sourceKey(): string
    {
        return 'linkedin_public';
    }

    protected function platform(): string
    {
        return 'linkedin';
    }

    protected function sourceLabel(): string
    {
        return 'LinkedIn Post';
    }

    protected function sourceIcon(): string
    {
        return 'in';
    }

    protected function siteFilters(): array
    {
        return ['linkedin.com/posts', 'linkedin.com/pulse', 'linkedin.com/feed'];
    }
}
