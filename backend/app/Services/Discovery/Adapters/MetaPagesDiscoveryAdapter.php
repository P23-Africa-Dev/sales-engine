<?php

namespace App\Services\Discovery\Adapters;

class MetaPagesDiscoveryAdapter extends StubDiscoveryAdapter
{
    public function key(): string
    {
        return 'meta';
    }

    protected function configKey(): string
    {
        return 'meta.access_token';
    }

    protected function envHint(): string
    {
        return 'META_ACCESS_TOKEN';
    }
}
