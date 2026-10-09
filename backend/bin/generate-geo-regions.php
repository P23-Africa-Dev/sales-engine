<?php

/**
 * One-shot generator for geo-regions.php — run via: php bin/generate-geo-regions.php
 */

$major = [
    'NG' => ['label' => 'Nigeria', 'gl' => 'ng', 'aliases' => ['nigeria', 'naija'], 'cities' => ['lagos' => 'Lagos', 'abuja' => 'Abuja', 'kano' => 'Kano', 'port harcourt' => 'Port Harcourt', 'ibadan' => 'Ibadan']],
    'GB' => ['label' => 'England', 'gl' => 'uk', 'aliases' => ['england', 'united kingdom', 'britain', 'great britain', 'u.k.', 'uk', 'gb'], 'cities' => ['london' => 'London', 'manchester' => 'Manchester', 'birmingham' => 'Birmingham', 'leeds' => 'Leeds', 'bristol' => 'Bristol', 'liverpool' => 'Liverpool', 'sheffield' => 'Sheffield']],
    'KE' => ['label' => 'Kenya', 'gl' => 'ke', 'aliases' => ['kenya'], 'cities' => ['nairobi' => 'Nairobi', 'mombasa' => 'Mombasa']],
    'GH' => ['label' => 'Ghana', 'gl' => 'gh', 'aliases' => ['ghana'], 'cities' => ['accra' => 'Accra', 'kumasi' => 'Kumasi']],
    'ZA' => ['label' => 'South Africa', 'gl' => 'za', 'aliases' => ['south africa'], 'cities' => ['johannesburg' => 'Johannesburg', 'cape town' => 'Cape Town', 'durban' => 'Durban', 'pretoria' => 'Pretoria']],
    'EG' => ['label' => 'Egypt', 'gl' => 'eg', 'aliases' => ['egypt'], 'cities' => ['cairo' => 'Cairo', 'alexandria' => 'Alexandria']],
    'US' => ['label' => 'United States', 'gl' => 'us', 'aliases' => ['united states', 'usa', 'u.s.', 'u.s.a.', 'america'], 'cities' => ['new york' => 'New York', 'san francisco' => 'San Francisco', 'los angeles' => 'Los Angeles', 'chicago' => 'Chicago', 'austin' => 'Austin', 'seattle' => 'Seattle', 'boston' => 'Boston']],
    'IN' => ['label' => 'India', 'gl' => 'in', 'aliases' => ['india', 'bharat'], 'cities' => ['mumbai' => 'Mumbai', 'delhi' => 'Delhi', 'bangalore' => 'Bangalore', 'bengaluru' => 'Bengaluru', 'hyderabad' => 'Hyderabad', 'chennai' => 'Chennai', 'pune' => 'Pune', 'kolkata' => 'Kolkata']],
    'DE' => ['label' => 'Germany', 'gl' => 'de', 'aliases' => ['germany', 'deutschland'], 'cities' => ['berlin' => 'Berlin', 'munich' => 'Munich', 'hamburg' => 'Hamburg', 'frankfurt' => 'Frankfurt', 'cologne' => 'Cologne', 'stuttgart' => 'Stuttgart', 'dusseldorf' => 'Dusseldorf']],
    'NL' => ['label' => 'Netherlands', 'gl' => 'nl', 'aliases' => ['netherlands', 'holland', 'netherland'], 'cities' => ['amsterdam' => 'Amsterdam', 'rotterdam' => 'Rotterdam', 'the hague' => 'The Hague', 'utrecht' => 'Utrecht', 'eindhoven' => 'Eindhoven']],
    'DK' => ['label' => 'Denmark', 'gl' => 'dk', 'aliases' => ['denmark', 'danmark'], 'cities' => ['copenhagen' => 'Copenhagen', 'aarhus' => 'Aarhus', 'odense' => 'Odense']],
    'SE' => ['label' => 'Sweden', 'gl' => 'se', 'aliases' => ['sweden', 'sverige'], 'cities' => ['stockholm' => 'Stockholm', 'gothenburg' => 'Gothenburg', 'malmo' => 'Malmo']],
    'FR' => ['label' => 'France', 'gl' => 'fr', 'aliases' => ['france'], 'cities' => ['paris' => 'Paris', 'lyon' => 'Lyon', 'marseille' => 'Marseille', 'toulouse' => 'Toulouse', 'nice' => 'Nice']],
    'AE' => ['label' => 'United Arab Emirates', 'gl' => 'ae', 'aliases' => ['united arab emirates', 'uae', 'u.a.e.'], 'cities' => ['dubai' => 'Dubai', 'abu dhabi' => 'Abu Dhabi', 'sharjah' => 'Sharjah']],
    'CA' => ['label' => 'Canada', 'gl' => 'ca', 'aliases' => ['canada'], 'cities' => ['toronto' => 'Toronto', 'vancouver' => 'Vancouver', 'montreal' => 'Montreal', 'calgary' => 'Calgary', 'ottawa' => 'Ottawa']],
    'AU' => ['label' => 'Australia', 'gl' => 'au', 'aliases' => ['australia'], 'cities' => ['sydney' => 'Sydney', 'melbourne' => 'Melbourne', 'brisbane' => 'Brisbane', 'perth' => 'Perth']],
    'BR' => ['label' => 'Brazil', 'gl' => 'br', 'aliases' => ['brazil', 'brasil'], 'cities' => ['sao paulo' => 'Sao Paulo', 'rio de janeiro' => 'Rio de Janeiro', 'brasilia' => 'Brasilia']],
    'CN' => ['label' => 'China', 'gl' => 'cn', 'aliases' => ['china', 'prc'], 'cities' => ['beijing' => 'Beijing', 'shanghai' => 'Shanghai', 'shenzhen' => 'Shenzhen', 'guangzhou' => 'Guangzhou']],
    'JP' => ['label' => 'Japan', 'gl' => 'jp', 'aliases' => ['japan'], 'cities' => ['tokyo' => 'Tokyo', 'osaka' => 'Osaka', 'yokohama' => 'Yokohama', 'nagoya' => 'Nagoya']],
    'SG' => ['label' => 'Singapore', 'gl' => 'sg', 'aliases' => ['singapore'], 'cities' => ['singapore' => 'Singapore']],
    'IE' => ['label' => 'Ireland', 'gl' => 'ie', 'aliases' => ['ireland', 'eire'], 'cities' => ['dublin' => 'Dublin', 'cork' => 'Cork']],
    'BE' => ['label' => 'Belgium', 'gl' => 'be', 'aliases' => ['belgium'], 'cities' => ['brussels' => 'Brussels', 'antwerp' => 'Antwerp', 'ghent' => 'Ghent']],
    'AT' => ['label' => 'Austria', 'gl' => 'at', 'aliases' => ['austria'], 'cities' => ['vienna' => 'Vienna', 'salzburg' => 'Salzburg']],
    'CH' => ['label' => 'Switzerland', 'gl' => 'ch', 'aliases' => ['switzerland'], 'cities' => ['zurich' => 'Zurich', 'geneva' => 'Geneva', 'basel' => 'Basel']],
    'PL' => ['label' => 'Poland', 'gl' => 'pl', 'aliases' => ['poland'], 'cities' => ['warsaw' => 'Warsaw', 'krakow' => 'Krakow', 'gdansk' => 'Gdansk']],
    'ES' => ['label' => 'Spain', 'gl' => 'es', 'aliases' => ['spain', 'espana'], 'cities' => ['madrid' => 'Madrid', 'barcelona' => 'Barcelona', 'valencia' => 'Valencia', 'seville' => 'Seville']],
    'IT' => ['label' => 'Italy', 'gl' => 'it', 'aliases' => ['italy', 'italia'], 'cities' => ['rome' => 'Rome', 'milan' => 'Milan', 'naples' => 'Naples', 'turin' => 'Turin']],
    'PT' => ['label' => 'Portugal', 'gl' => 'pt', 'aliases' => ['portugal'], 'cities' => ['lisbon' => 'Lisbon', 'porto' => 'Porto']],
    'TR' => ['label' => 'Turkey', 'gl' => 'tr', 'aliases' => ['turkey', 'turkiye'], 'cities' => ['istanbul' => 'Istanbul', 'ankara' => 'Ankara', 'izmir' => 'Izmir']],
    'SA' => ['label' => 'Saudi Arabia', 'gl' => 'sa', 'aliases' => ['saudi arabia', 'ksa'], 'cities' => ['riyadh' => 'Riyadh', 'jeddah' => 'Jeddah', 'dammam' => 'Dammam']],
    'MX' => ['label' => 'Mexico', 'gl' => 'mx', 'aliases' => ['mexico'], 'cities' => ['mexico city' => 'Mexico City', 'guadalajara' => 'Guadalajara', 'monterrey' => 'Monterrey']],
    'RW' => ['label' => 'Rwanda', 'gl' => 'rw', 'aliases' => ['rwanda'], 'cities' => ['kigali' => 'Kigali']],
    'NO' => ['label' => 'Norway', 'gl' => 'no', 'aliases' => ['norway'], 'cities' => ['oslo' => 'Oslo', 'bergen' => 'Bergen']],
    'FI' => ['label' => 'Finland', 'gl' => 'fi', 'aliases' => ['finland'], 'cities' => ['helsinki' => 'Helsinki']],
    'NZ' => ['label' => 'New Zealand', 'gl' => 'nz', 'aliases' => ['new zealand'], 'cities' => ['auckland' => 'Auckland', 'wellington' => 'Wellington']],
    'KR' => ['label' => 'South Korea', 'gl' => 'kr', 'aliases' => ['south korea', 'korea'], 'cities' => ['seoul' => 'Seoul', 'busan' => 'Busan']],
    'HK' => ['label' => 'Hong Kong', 'gl' => 'hk', 'aliases' => ['hong kong'], 'cities' => ['hong kong' => 'Hong Kong']],
    'TW' => ['label' => 'Taiwan', 'gl' => 'tw', 'aliases' => ['taiwan'], 'cities' => ['taipei' => 'Taipei']],
    'IL' => ['label' => 'Israel', 'gl' => 'il', 'aliases' => ['israel'], 'cities' => ['tel aviv' => 'Tel Aviv', 'jerusalem' => 'Jerusalem']],
    'AR' => ['label' => 'Argentina', 'gl' => 'ar', 'aliases' => ['argentina'], 'cities' => ['buenos aires' => 'Buenos Aires']],
    'CL' => ['label' => 'Chile', 'gl' => 'cl', 'aliases' => ['chile'], 'cities' => ['santiago' => 'Santiago']],
    'CO' => ['label' => 'Colombia', 'gl' => 'co', 'aliases' => ['colombia'], 'cities' => ['bogota' => 'Bogota', 'medellin' => 'Medellin']],
    'PH' => ['label' => 'Philippines', 'gl' => 'ph', 'aliases' => ['philippines'], 'cities' => ['manila' => 'Manila', 'cebu' => 'Cebu']],
    'ID' => ['label' => 'Indonesia', 'gl' => 'id', 'aliases' => ['indonesia'], 'cities' => ['jakarta' => 'Jakarta', 'surabaya' => 'Surabaya']],
    'MY' => ['label' => 'Malaysia', 'gl' => 'my', 'aliases' => ['malaysia'], 'cities' => ['kuala lumpur' => 'Kuala Lumpur']],
    'TH' => ['label' => 'Thailand', 'gl' => 'th', 'aliases' => ['thailand'], 'cities' => ['bangkok' => 'Bangkok']],
    'VN' => ['label' => 'Vietnam', 'gl' => 'vn', 'aliases' => ['vietnam'], 'cities' => ['ho chi minh city' => 'Ho Chi Minh City', 'hanoi' => 'Hanoi']],
    'PK' => ['label' => 'Pakistan', 'gl' => 'pk', 'aliases' => ['pakistan'], 'cities' => ['karachi' => 'Karachi', 'lahore' => 'Lahore', 'islamabad' => 'Islamabad']],
    'BD' => ['label' => 'Bangladesh', 'gl' => 'bd', 'aliases' => ['bangladesh'], 'cities' => ['dhaka' => 'Dhaka']],
    'TZ' => ['label' => 'Tanzania', 'gl' => 'tz', 'aliases' => ['tanzania'], 'cities' => ['dar es salaam' => 'Dar es Salaam']],
    'UG' => ['label' => 'Uganda', 'gl' => 'ug', 'aliases' => ['uganda'], 'cities' => ['kampala' => 'Kampala']],
    'ET' => ['label' => 'Ethiopia', 'gl' => 'et', 'aliases' => ['ethiopia'], 'cities' => ['addis ababa' => 'Addis Ababa']],
    'MA' => ['label' => 'Morocco', 'gl' => 'ma', 'aliases' => ['morocco'], 'cities' => ['casablanca' => 'Casablanca', 'rabat' => 'Rabat']],
    'SN' => ['label' => 'Senegal', 'gl' => 'sn', 'aliases' => ['senegal'], 'cities' => ['dakar' => 'Dakar']],
    'CI' => ['label' => 'Ivory Coast', 'gl' => 'ci', 'aliases' => ['ivory coast', 'cote divoire'], 'cities' => ['abidjan' => 'Abidjan']],
    'CZ' => ['label' => 'Czech Republic', 'gl' => 'cz', 'aliases' => ['czech republic', 'czechia'], 'cities' => ['prague' => 'Prague']],
    'RO' => ['label' => 'Romania', 'gl' => 'ro', 'aliases' => ['romania'], 'cities' => ['bucharest' => 'Bucharest']],
    'HU' => ['label' => 'Hungary', 'gl' => 'hu', 'aliases' => ['hungary'], 'cities' => ['budapest' => 'Budapest']],
    'GR' => ['label' => 'Greece', 'gl' => 'gr', 'aliases' => ['greece'], 'cities' => ['athens' => 'Athens']],
    'RU' => ['label' => 'Russia', 'gl' => 'ru', 'aliases' => ['russia'], 'cities' => ['moscow' => 'Moscow', 'saint petersburg' => 'Saint Petersburg']],
];

$iso = [
    'AF' => 'Afghanistan', 'AL' => 'Albania', 'DZ' => 'Algeria', 'AD' => 'Andorra', 'AO' => 'Angola',
    'AG' => 'Antigua and Barbuda', 'AM' => 'Armenia', 'AZ' => 'Azerbaijan', 'BS' => 'Bahamas', 'BH' => 'Bahrain',
    'BB' => 'Barbados', 'BY' => 'Belarus', 'BZ' => 'Belize', 'BJ' => 'Benin', 'BT' => 'Bhutan', 'BO' => 'Bolivia',
    'BA' => 'Bosnia and Herzegovina', 'BW' => 'Botswana', 'BN' => 'Brunei', 'BG' => 'Bulgaria', 'BF' => 'Burkina Faso',
    'BI' => 'Burundi', 'CV' => 'Cabo Verde', 'KH' => 'Cambodia', 'CM' => 'Cameroon', 'CF' => 'Central African Republic',
    'TD' => 'Chad', 'KM' => 'Comoros', 'CG' => 'Congo', 'CD' => 'Democratic Republic of the Congo', 'CR' => 'Costa Rica',
    'HR' => 'Croatia', 'CU' => 'Cuba', 'CY' => 'Cyprus', 'DJ' => 'Djibouti', 'DM' => 'Dominica', 'DO' => 'Dominican Republic',
    'EC' => 'Ecuador', 'SV' => 'El Salvador', 'GQ' => 'Equatorial Guinea', 'ER' => 'Eritrea', 'EE' => 'Estonia',
    'SZ' => 'Eswatini', 'FJ' => 'Fiji', 'GA' => 'Gabon', 'GM' => 'Gambia', 'GE' => 'Georgia', 'GD' => 'Grenada',
    'GT' => 'Guatemala', 'GN' => 'Guinea', 'GW' => 'Guinea-Bissau', 'GY' => 'Guyana', 'HT' => 'Haiti', 'HN' => 'Honduras',
    'IS' => 'Iceland', 'IQ' => 'Iraq', 'IR' => 'Iran', 'JM' => 'Jamaica', 'JO' => 'Jordan', 'KZ' => 'Kazakhstan',
    'KW' => 'Kuwait', 'KG' => 'Kyrgyzstan', 'LA' => 'Laos', 'LV' => 'Latvia', 'LB' => 'Lebanon', 'LS' => 'Lesotho',
    'LR' => 'Liberia', 'LY' => 'Libya', 'LI' => 'Liechtenstein', 'LT' => 'Lithuania', 'LU' => 'Luxembourg',
    'MG' => 'Madagascar', 'MW' => 'Malawi', 'MV' => 'Maldives', 'ML' => 'Mali', 'MT' => 'Malta', 'MH' => 'Marshall Islands',
    'MR' => 'Mauritania', 'MU' => 'Mauritius', 'FM' => 'Micronesia', 'MD' => 'Moldova', 'MC' => 'Monaco', 'MN' => 'Mongolia',
    'ME' => 'Montenegro', 'MZ' => 'Mozambique', 'MM' => 'Myanmar', 'NA' => 'Namibia', 'NR' => 'Nauru', 'NP' => 'Nepal',
    'NI' => 'Nicaragua', 'NE' => 'Niger', 'KP' => 'North Korea', 'MK' => 'North Macedonia', 'OM' => 'Oman', 'PW' => 'Palau',
    'PA' => 'Panama', 'PG' => 'Papua New Guinea', 'PY' => 'Paraguay', 'PE' => 'Peru', 'QA' => 'Qatar',
    'KN' => 'Saint Kitts and Nevis', 'LC' => 'Saint Lucia', 'VC' => 'Saint Vincent and the Grenadines', 'WS' => 'Samoa',
    'SM' => 'San Marino', 'ST' => 'Sao Tome and Principe', 'RS' => 'Serbia', 'SC' => 'Seychelles', 'SL' => 'Sierra Leone',
    'SK' => 'Slovakia', 'SI' => 'Slovenia', 'SB' => 'Solomon Islands', 'SO' => 'Somalia', 'SS' => 'South Sudan',
    'LK' => 'Sri Lanka', 'SD' => 'Sudan', 'SR' => 'Suriname', 'SY' => 'Syria', 'TJ' => 'Tajikistan', 'TL' => 'Timor-Leste',
    'TG' => 'Togo', 'TO' => 'Tonga', 'TT' => 'Trinidad and Tobago', 'TN' => 'Tunisia', 'TM' => 'Turkmenistan',
    'TV' => 'Tuvalu', 'UA' => 'Ukraine', 'UY' => 'Uruguay', 'UZ' => 'Uzbekistan', 'VU' => 'Vanuatu', 'VE' => 'Venezuela',
    'YE' => 'Yemen', 'ZM' => 'Zambia', 'ZW' => 'Zimbabwe', 'PS' => 'Palestine', 'XK' => 'Kosovo',
];

$regions = [];
foreach ($major as $isoCode => $meta) {
    $gl = $meta['gl'];
    $aliases = array_values(array_unique(array_merge(
        $meta['aliases'],
        [mb_strtolower($meta['label']), mb_strtolower($gl), mb_strtolower($isoCode)]
    )));
    $regions[] = [
        'label' => $meta['label'],
        'gl' => $gl,
        'hunterCountry' => $isoCode,
        'aliases' => $aliases,
        'cities' => $meta['cities'],
    ];
}

$majorGl = [];
foreach ($major as $m) {
    $majorGl[$m['gl']] = true;
}

foreach ($iso as $code => $label) {
    if (isset($major[$code])) {
        continue;
    }
    $gl = strtolower($code);
    if (isset($majorGl[$gl])) {
        continue;
    }
    $regions[] = [
        'label' => $label,
        'gl' => $gl,
        'hunterCountry' => $code,
        'aliases' => [mb_strtolower($label), $gl],
        'cities' => [],
    ];
}

$path = dirname(__DIR__).'/app/Services/Discovery/data/geo-regions.php';
@mkdir(dirname($path), 0777, true);
$export = var_export($regions, true);
$content = <<<PHP
<?php

/**
 * ISO country catalog for DiscoveryGeo.
 * Each entry: label, gl (Serper), hunterCountry (ISO alpha-2), aliases, cities.
 */

return {$export};

PHP;

file_put_contents($path, $content);
fwrite(STDOUT, count($regions)." regions -> {$path}\n");
