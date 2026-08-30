<?php

namespace App\Services\Discovery\Adapters;

class HunterDiscoveryAdapter extends StubDiscoveryAdapter
{
    public function key(): string
    {
        return 'hunter';
    }

    protected function configKey(): string
    {
        return 'hunter.api_key';
    }

    protected function envHint(): string
    {
        return 'HUNTER_API_KEY';
    }
}
