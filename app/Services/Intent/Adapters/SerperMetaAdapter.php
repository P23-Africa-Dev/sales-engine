<?php

namespace App\Services\Intent\Adapters;

class SerperMetaAdapter extends AbstractSerperSocialAdapter
{
    protected function sourceKey(): string
    {
        return 'meta_pages';
    }

    protected function platform(): string
    {
        return 'meta';
    }

    protected function sourceLabel(): string
    {
        return 'Meta Page Post';
    }

    protected function sourceIcon(): string
    {
        return 'f';
    }

    protected function siteFilters(): array
    {
        return ['facebook.com'];
    }
}
