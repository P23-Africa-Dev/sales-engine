<?php

return [

    'limits' => [
        'searches_per_month' => (int) env('SALES_ENGINE_SEARCHES_PER_MONTH', 500),
        'outreach_emails_per_month' => (int) env('SALES_ENGINE_OUTREACH_EMAILS_PER_MONTH', 300),
        'enrichment_lookups_per_month' => (int) env('SALES_ENGINE_ENRICHMENT_LOOKUPS_PER_MONTH', 1000),
    ],

];
