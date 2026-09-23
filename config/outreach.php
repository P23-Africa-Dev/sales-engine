<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Daily send caps
    |--------------------------------------------------------------------------
    */
    'quota' => [
        'platform_daily' => (int) env('OUTREACH_PLATFORM_DAILY_CAP', 30),
        'organization_warmup_start' => (int) env('OUTREACH_ORG_WARMUP_START', 50),
        'organization_daily_ceiling' => (int) env('OUTREACH_ORG_DAILY_CEILING', 500),
        'mailbox_daily' => (int) env('OUTREACH_MAILBOX_DAILY_CAP', 40),
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

    /*
    |--------------------------------------------------------------------------
    | Mailbox OAuth (send-only)
    |--------------------------------------------------------------------------
    */
    'mailbox' => [
        'google' => [
            'client_id' => env('OUTREACH_GOOGLE_CLIENT_ID', env('GOOGLE_MAIL_CLIENT_ID')),
            'client_secret' => env('OUTREACH_GOOGLE_CLIENT_SECRET', env('GOOGLE_MAIL_CLIENT_SECRET')),
            'redirect_uri' => env('OUTREACH_GOOGLE_REDIRECT_URI'),
            'scopes' => array_filter(array_map('trim', explode(' ', (string) env(
                'OUTREACH_GOOGLE_SCOPES',
                'openid email profile https://www.googleapis.com/auth/gmail.send'
            )))),
        ],
        'microsoft' => [
            'client_id' => env('OUTREACH_MICROSOFT_CLIENT_ID', env('MICROSOFT_MAIL_CLIENT_ID')),
            'client_secret' => env('OUTREACH_MICROSOFT_CLIENT_SECRET', env('MICROSOFT_MAIL_CLIENT_SECRET')),
            'tenant' => env('OUTREACH_MICROSOFT_TENANT', env('MICROSOFT_MAIL_TENANT', 'common')),
            'redirect_uri' => env('OUTREACH_MICROSOFT_REDIRECT_URI'),
            'scopes' => array_filter(array_map('trim', explode(' ', (string) env(
                'OUTREACH_MICROSOFT_SCOPES',
                'openid offline_access User.Read Mail.Send'
            )))),
        ],
        'zoho' => [
            'client_id' => env('OUTREACH_ZOHO_CLIENT_ID', env('ZOHO_MAIL_CLIENT_ID')),
            'client_secret' => env('OUTREACH_ZOHO_CLIENT_SECRET', env('ZOHO_MAIL_CLIENT_SECRET')),
            'datacenter' => env('OUTREACH_ZOHO_DATACENTER', env('ZOHO_MAIL_DATACENTER', 'com')),
            'redirect_uri' => env('OUTREACH_ZOHO_REDIRECT_URI'),
            'scopes' => array_filter(array_map('trim', explode(',', (string) env(
                'OUTREACH_ZOHO_SCOPES',
                'ZohoMail.messages.ALL,ZohoMail.accounts.READ'
            )))),
        ],
        'frontend_callback' => env('OUTREACH_MAILBOX_FRONTEND_CALLBACK', env('FRONTEND_URL', 'http://localhost:3000').'/sales-engine/outreach/mailbox-connected'),
    ],

];
