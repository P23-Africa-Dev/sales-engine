<?php

namespace App\Services\Discovery\Adapters;

class YoutubeDiscoveryAdapter extends StubDiscoveryAdapter
{
    public function key(): string
    {
        return 'youtube';
    }

    protected function configKey(): string
    {
        return 'youtube.api_key';
    }

    protected function envHint(): string
    {
        return 'YOUTUBE_API_KEY';
    }
}
