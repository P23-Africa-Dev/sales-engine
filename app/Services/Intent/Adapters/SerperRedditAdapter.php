<?php

namespace App\Services\Intent\Adapters;

class SerperRedditAdapter extends AbstractSerperSocialAdapter
{
    protected function sourceKey(): string
    {
        return 'reddit';
    }

    protected function platform(): string
    {
        return 'reddit';
    }

    protected function sourceLabel(): string
    {
        return 'Reddit Post';
    }

    protected function sourceIcon(): string
    {
        return 'r';
    }

    protected function siteFilters(): array
    {
        return ['reddit.com'];
    }
}
