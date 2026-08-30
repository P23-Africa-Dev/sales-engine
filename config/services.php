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
        'base_url' => env('GLM_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4'),
        'chat_model' => env('GLM_CHAT_MODEL', 'glm-4-flash'),
        'extract_model' => env('GLM_EXTRACT_MODEL', 'glm-4-flash'),
        'score_model' => env('GLM_SCORE_MODEL', 'glm-4-air'),
        'outreach_model' => env('GLM_OUTREACH_MODEL', 'glm-4-flash'),
    ],

    'serper' => [
        'api_key' => env('SERPER_API_KEY'),
        'base_url' => env('SERPER_BASE_URL', 'https://google.serper.dev'),
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
    ],

    'apollo' => [
        'api_key' => env('APOLLO_API_KEY'),
    ],

    'hunter' => [
        'api_key' => env('HUNTER_API_KEY'),
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

];
