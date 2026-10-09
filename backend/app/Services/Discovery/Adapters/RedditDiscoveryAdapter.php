<?php

namespace App\Services\Discovery\Adapters;

class RedditDiscoveryAdapter extends StubDiscoveryAdapter
{
    public function key(): string
    {
        return 'reddit';
    }

    protected function configKey(): string
    {
        return 'reddit.client_id';
    }

    protected function envHint(): string
    {
        return 'REDDIT_CLIENT_ID';
    }
}
