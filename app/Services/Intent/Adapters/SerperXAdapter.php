<?php

namespace App\Services\Intent\Adapters;

class SerperXAdapter extends AbstractSerperSocialAdapter
{
    protected function sourceKey(): string
    {
        return 'x_mentions';
    }

    protected function platform(): string
    {
        return 'x';
    }

    protected function sourceLabel(): string
    {
        return 'X/Twitter Post';
    }

    protected function sourceIcon(): string
    {
        return 'X';
    }

    protected function siteFilters(): array
    {
        return ['twitter.com', 'x.com'];
    }
}
