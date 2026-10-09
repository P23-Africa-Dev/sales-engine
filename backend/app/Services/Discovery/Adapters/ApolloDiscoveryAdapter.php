<?php

namespace App\Services\Discovery\Adapters;

class ApolloDiscoveryAdapter extends StubDiscoveryAdapter
{
    public function key(): string
    {
        return 'apollo';
    }

    protected function configKey(): string
    {
        return 'apollo.api_key';
    }

    protected function envHint(): string
    {
        return 'APOLLO_API_KEY';
    }
}
