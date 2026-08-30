<?php

namespace App\Services\Discovery\Adapters;

class XDiscoveryAdapter extends StubDiscoveryAdapter
{
    public function key(): string
    {
        return 'x';
    }

    protected function configKey(): string
    {
        return 'x.bearer_token';
    }

    protected function envHint(): string
    {
        return 'X_BEARER_TOKEN';
    }
}
