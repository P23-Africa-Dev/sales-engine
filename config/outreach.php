<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Daily send caps (organization domain warm-up)
    |--------------------------------------------------------------------------
    */
    'quota' => [
        'platform_daily' => (int) env('OUTREACH_PLATFORM_DAILY_CAP', 30),
        'organization_warmup_start' => (int) env('OUTREACH_ORG_WARMUP_START', 50),
        'organization_daily_ceiling' => (int) env('OUTREACH_ORG_DAILY_CEILING', 500),
    ],

    /*
    |--------------------------------------------------------------------------
    | Consumer / free mailbox domains blocked for organization From
    |--------------------------------------------------------------------------
    */
    'consumer_domains' => [
        'gmail.com',
        'googlemail.com',
        'outlook.com',
        'hotmail.com',
        'live.com',
        'msn.com',
        'yahoo.com',
        'ymail.com',
        'icloud.com',
        'me.com',
        'mac.com',
        'aol.com',
        'protonmail.com',
        'proton.me',
        'gmx.com',
        'gmx.net',
        'mail.com',
        'zoho.com',
        'zohomail.com',
    ],

];
