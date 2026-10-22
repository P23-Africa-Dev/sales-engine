<?php

namespace App\Support;

class CompanyLogo
{
    public static function fromWebsite(?string $website): ?string
    {
        $website = trim((string) $website);
        if ($website === '') {
            return null;
        }

        $host = parse_url(str_contains($website, '://') ? $website : 'https://'.$website, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return null;
        }

        return 'https://www.google.com/s2/favicons?domain='.urlencode($host).'&sz=128';
    }
}
