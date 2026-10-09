<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'glm' => [
        'api_key' => env('GLM_API_KEY'),
        'base_url' => env('GLM_BASE_URL', 'https://api.z.ai/api/paas/v4'),
        'chat_model' => env('GLM_CHAT_MODEL', 'glm-5.2'),
        'research_model' => env('GLM_RESEARCH_MODEL', 'glm-5.2'),
        'extract_model' => env('GLM_EXTRACT_MODEL', 'glm-5'),
        'score_model' => env('GLM_SCORE_MODEL', 'glm-5.1'),
        'outreach_model' => env('GLM_OUTREACH_MODEL', 'glm-5.2'),
    ],

    'serper' => [
        'api_key' => env('SERPER_API_KEY'),
        'base_url' => env('SERPER_BASE_URL', 'https://google.serper.dev'),
        // Raise via env; ConfigMap defaults to 20 for freemium yield.
        'max_results' => (int) env('SERPER_MAX_RESULTS', 20),
    ],

    'mono' => [
        'secret_key' => env('MONO_SECRET_KEY'),
        'base_url' => env('MONO_BASE_URL', 'https://api.withmono.com'),
    ],

    'fylings' => [
        'api_key' => env('FYLINGS_API_KEY'),
        'base_url' => env('FYLINGS_BASE_URL', 'https://api.fylings.com'),
    ],

    'factory23' => [
        'api_url' => env('FACTORY23_API_URL'),
        'jwt_secret' => env('FACTORY23_JWT_SECRET'),
        'crm_sync_enabled' => (bool) env('FACTORY23_CRM_SYNC_ENABLED', false),
        'api_token' => env('FACTORY23_API_TOKEN'),
        // Shared secret for Control → SE provision calls (X-Internal-Token).
        'internal_token' => env('FACTORY23_INTERNAL_TOKEN', env('FACTORY23_API_TOKEN')),
        'company_tokens' => array_filter(
            json_decode((string) env('FACTORY23_COMPANY_TOKENS', '{}'), true) ?: [],
            fn($token) => is_string($token) && trim($token) !== '',
        ),
    ],

    'apollo' => [
        'api_key' => env('APOLLO_API_KEY'),
    ],

    'hunter' => [
        'api_key' => env('HUNTER_API_KEY'),
    ],

    'bytemine' => [
        'api_key' => env('BYTEMINE_API_KEY'),
        'base_url' => env('BYTEMINE_BASE_URL', 'https://api.bytemine.ai/v1'),
    ],

    'cleanlist' => [
        'api_key' => env('CLEANLIST_API_KEY'),
        'base_url' => env('CLEANLIST_BASE_URL', 'https://api.cleanlist.ai/v1'),
    ],

    'youtube' => [
        'api_key' => env('YOUTUBE_API_KEY'),
    ],

    'x' => [
        'bearer_token' => env('X_BEARER_TOKEN'),
    ],

    'reddit' => [
        'client_id' => env('REDDIT_CLIENT_ID'),
        'client_secret' => env('REDDIT_CLIENT_SECRET'),
        'user_agent' => env('REDDIT_USER_AGENT', 'sales-engine/1.0'),
    ],

    'meta' => [
        'access_token' => env('META_ACCESS_TOKEN'),
        'app_id' => env('META_APP_ID'),
        'app_secret' => env('META_APP_SECRET'),
    ],

    'sendgrid' => [
        'api_key' => env('SENDGRID_API_KEY'),
        'platform_from_email' => env('SENDGRID_PLATFORM_FROM_EMAIL', 'outreach@thefactory23.com'),
        'webhook_secret' => env('SENDGRID_WEBHOOK_SECRET'),
        'webhook_public_key' => env('SENDGRID_WEBHOOK_PUBLIC_KEY'),
        'unsubscribe_group_id' => env('SENDGRID_UNSUBSCRIBE_GROUP_ID'),
    ],

    'infobip' => [
        'base_url' => env('INFOBIP_BASE_URL'),
        'api_key' => env('INFOBIP_API_KEY'),
        'sms_from' => env('INFOBIP_SMS_FROM'),
        'webhook_token' => env('INFOBIP_SMS_WEBHOOK_TOKEN'),
    ],

    'social_listening' => [
        'daily_api_cap' => (int) env('SOCIAL_LISTENING_DAILY_API_CAP', 200),
        // Stage 2 discrete signal-type detection: how many active signal types (from
        // SignalTypeRegistry) get their own dedicated search query per run. Each one
        // is searched across every enabled source, so this directly multiplies API
        // call volume for the run — keep conservative.
        'max_signal_type_queries_per_run' => (int) env('SOCIAL_LISTENING_MAX_SIGNAL_TYPE_QUERIES', 8),
        // Global default for new SocialListeningSetting rows' icp_filter_enabled kill
        // switch (Stage 1 hard filter). Per-org/per-ICP override lives on the setting
        // row itself; this only controls what NEW settings rows default to.
        'icp_filter_enabled_default' => (bool) env('SOCIAL_LISTENING_ICP_FILTER_ENABLED_DEFAULT', true),
    ],

    'chat' => [
        'history_window' => (int) env('CHAT_HISTORY_WINDOW', 20),
        'summary_trigger' => (int) env('CHAT_SUMMARY_TRIGGER', 40),
    ],

];
