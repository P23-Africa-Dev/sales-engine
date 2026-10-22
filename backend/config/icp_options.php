<?php

return [

    'industries' => [
        'Software', 'Financial services', 'Logistics', 'Healthcare', 'Manufacturing',
        'Retail', 'Energy', 'Education', 'Hospitality', 'Professional services',
    ],

    'company_sizes' => ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],

    'revenue_ranges' => [
        'Under $1M', '$1M-$10M', '$10M-$50M', '$50M-$100M', '$100M+',
    ],

    'suggested_territories' => [
        'Lagos', 'Abuja', 'Nairobi', 'Accra', 'Johannesburg', 'Cape Town', 'Cairo', 'London',
    ],

    'decision_makers' => [
        'Founder', 'CEO', 'Managing Director', 'Head of Sales', 'Operations Manager', 'Procurement',
    ],

    'signal_type_packs' => [
        ['value' => 'default', 'label' => 'Default', 'description' => 'General buying signals across industries.'],
        ['value' => 'software_dev_vertical', 'label' => 'Software', 'description' => 'Hiring, tooling, and vendor-switch signals for software teams.'],
        ['value' => 'lagos_corporate_transport', 'label' => 'Lagos corporate transport', 'description' => 'Fleet, shuttle, and staff-mobility signals.'],
        ['value' => 'none', 'label' => 'None', 'description' => 'Do not add discrete signal-type searches.'],
    ],

];
