"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const allPricingPlans = [
  {
    key: "up_to_5",
    price: { monthly: 99, yearly: 79 },
    monthlyAmount: "$99",
    annualAmount: "$990",
    users: "Up to 5 users",
    description:
      "Perfect for startups and small field teams looking to streamline operations, manage customer relationships, and track field activities efficiently.",
    featured: false,
  },
  {
    key: "up_to_10",
    price: { monthly: 199, yearly: 159 },
    monthlyAmount: "$199",
    annualAmount: "$1,990",
    users: "Up to 10 users",
    description:
      "Designed for growing teams that require better visibility, collaboration, and operational control across multiple field activities.",
    featured: false,
  },
  {
    key: "up_to_15",
    price: { monthly: 279, yearly: 229 },
    monthlyAmount: "$279",
    annualAmount: "$2,790",
    users: "Up to 15 users",
    description:
      "Ideal for expanding businesses managing larger field operations, customer pipelines, and performance driven teams.",
    featured: true,
  },
  {
    key: "up_to_20",
    price: { monthly: 319, yearly: 259 },
    monthlyAmount: "$319",
    annualAmount: "$3,190",
    users: "Up to 20 users",
    description:
      "Built for organizations requiring advanced operational oversight, team coordination, and scalable field intelligence.",
    featured: false,
  },
  {
    key: "up_to_25",
    price: { monthly: 389, yearly: 319 },
    monthlyAmount: "$389",
    annualAmount: "$3,890",
    users: "Up to 25 users",
    description: "Ideal for mid sized organizations with multiple field squads.",
    featured: false,
  },
  {
    key: "up_to_30",
    price: { monthly: 459, yearly: 379 },
    monthlyAmount: "$459",
    annualAmount: "$4,590",
    users: "Up to 30 users",
    description: "Expanded capacity for scaled operations and territory management.",
    featured: false,
  },
  {
    key: "up_to_40",
    price: { monthly: 599, yearly: 499 },
    monthlyAmount: "$599",
    annualAmount: "$5,990",
    users: "Up to 40 users",
    description: "Comprehensive package for large field force organizations.",
    featured: false,
  },
  {
    key: "up_to_50",
    price: { monthly: 739, yearly: 619 },
    monthlyAmount: "$739",
    annualAmount: "$7,390",
    users: "Up to 50 users",
    description: "High capacity tier with dedicated operational capabilities.",
    featured: false,
  },
  {
    key: "up_to_75",
    price: { monthly: 1049, yearly: 869 },
    monthlyAmount: "$1,049",
    annualAmount: "$10,490",
    users: "Up to 75 users",
    description: "Enterprise scale field management for multi region operations.",
    featured: false,
  },
  {
    key: "up_to_100",
    price: { monthly: 1349, yearly: 1119 },
    monthlyAmount: "$1,349",
    annualAmount: "$13,490",
    users: "Up to 100 users",
    description: "Maximum self serve plan for extensive workforce deployments.",
    featured: false,
  },
];

const pricingFeatures = [
  "Field Operations Management",
  "CRM & Customer Management",
  "KPI & Performance Tracking",
  "AI Assistant (ELY)",
  "Business Intelligence & Maps",
];

export default function PricingSection() {
  const [billingYearly, setBillingYearly] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const router = useRouter();

  const handleChoosePlan = (planKey: string) => {
    const interval = billingYearly ? "annual" : "monthly";
    router.push(`/register?plan=${planKey}&interval=${interval}`);
  };

  const featuredCards = allPricingPlans.slice(0, 4);

  return (
    <section
      id="pricing"
      className="w-full bg-[#133139] py-20 lg:py-28 px-6 sm:px-12 lg:px-24 font-sans relative overflow-hidden"
    >
      {/* Geometric hexagon background decoration */}
      <svg
        width="383"
        height="1128"
        viewBox="0 0 383 1128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute right-0 top-0 h-full w-auto pointer-events-none z-0 select-none hidden md:block"
        aria-hidden="true"
      >
        <g opacity="0.1">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M722.644 334.603H462.149L381.635 582.591L592.385 735.855L803.147 582.591L722.644 334.603ZM368.164 586.959L453.819 323.125H730.967L816.622 586.959L592.388 750.042L368.164 586.959Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M733.878 320.408H450.903L363.429 589.633L592.385 756.039L821.352 589.633L733.878 320.408ZM350.539 593.831L442.92 309.417H741.855L834.247 593.831L592.388 769.625L350.539 593.831Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M745.132 304.232H439.663L345.245 594.747L592.392 774.275L839.55 594.747L745.132 304.232ZM332.914 598.752L432.037 293.75H752.75L851.872 598.752L592.393 787.25L332.914 598.752Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M756.374 288.089H428.414L327.039 599.846L592.394 792.511L857.749 599.846L756.374 288.089ZM315.289 603.659L421.144 278.083H763.642L869.497 603.659L592.393 804.875L315.289 603.659Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M767.624 271.925H417.157L308.833 604.93L592.396 810.747L875.96 604.93L767.624 271.925ZM297.664 608.562L410.256 262.417H774.519L887.122 608.562L592.393 822.5L297.664 608.562Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M778.883 255.739H405.924L290.642 610.027L592.392 828.993L894.166 610.027L778.883 255.739ZM280.039 613.479L399.375 246.75H785.422L904.747 613.479L592.393 840.125L280.039 613.479Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M790.116 239.598H394.67L272.443 615.126L592.387 847.228L912.343 615.126L790.116 239.598ZM262.414 618.374L388.469 231.083H796.317L922.372 618.374L592.388 857.75L262.414 618.374Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M801.379 223.434H383.425L254.236 620.239L592.402 865.474L930.568 620.239L801.379 223.434ZM247.15 624.998L244.789 623.284L377.581 215.417H807.228L939.997 623.284L592.399 875.375L247.15 624.998Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M812.607 207.282H372.169L236.022 625.316L592.388 883.698L948.753 625.316L812.607 207.282ZM227.164 628.202L366.678 199.75H818.086L957.622 628.202L592.388 893L227.164 628.202Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M823.87 193.066H360.919L217.824 632.387L592.395 903.89L966.966 632.387L823.87 193.066ZM209.539 635.059L355.788 186.042H828.999L975.247 635.059L592.393 912.583L209.539 635.059Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M835.504 176.903H351.252L201.578 637.482L593.372 922.125L985.178 637.482L835.504 176.903ZM193.875 639.973L346.502 170.375H840.248L992.875 639.973L593.369 930.208L193.875 639.973Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M846.751 160.762H339.992L183.357 642.569L593.372 940.359L1003.4 642.569L846.751 160.762ZM178.02 646.177L176.25 644.88L335.614 154.708H851.147L1010.5 644.88L593.369 947.833L178.02 646.177Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M857.995 144.588H328.761L165.181 647.667L593.378 958.593L1021.59 647.667L857.995 144.588ZM158.625 649.786L324.72 139.042H862.041L1028.12 649.786L593.375 965.458L158.625 649.786Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1039.8 652.772L869.254 128.436H317.512L146.959 652.772L593.378 976.838L1039.8 652.772ZM142.489 655.793L141 654.711L313.245 125.122L313.821 123.375H872.929L1045.75 654.711L594.864 982.012L593.375 983.083L142.489 655.793Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M880.505 112.274H306.251L128.76 657.856L593.384 995.061L1058 657.856L880.505 112.274ZM123.375 659.614L302.93 107.708H883.82L1063.38 659.614L593.381 1000.71L123.375 659.614Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M891.745 96.1106H295.001L110.539 662.972L593.379 1013.31L1076.21 662.972L891.745 96.1106ZM106.946 665.396L105.75 664.539L291.566 93.4506L292.029 92.0416H894.721L1080.54 663.13L1081 664.539L593.375 1018.33L106.946 665.396Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M903.001 81.9062H283.743L92.3324 670.014L593.367 1033.49L1094.41 670.014L903.001 81.9062ZM89.1747 672.144L88.125 671.378L280.732 79.5732L281.15 78.3334H905.6L1098.23 670.138L1098.62 671.378L593.369 1037.92L89.1747 672.144Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1112.59 675.117L914.247 65.7772H272.512L74.1566 675.117L593.374 1051.72L1112.59 675.117ZM71.4257 676.954L70.5 676.289L269.917 63.7486L270.267 62.6666H916.495L1115.9 675.219L1116.25 676.289L594.289 1054.87L593.375 1055.54L71.4257 676.954Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M925.499 49.6035H261.251L55.9349 680.214L593.37 1069.97L1130.8 680.214L925.499 49.6035ZM53.6315 681.769L52.875 681.206L259.072 47.9129L259.354 47H927.385L1133.59 680.316L1133.88 681.206L593.369 1073.17L53.6315 681.769Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1149.02 685.313L936.753 33.4408H250.013L37.7362 685.313L593.377 1088.18L1149.02 685.313ZM35.8823 686.564L35.25 686.102L248.238 32.0546L248.475 31.3334H938.286L1151.26 685.381L1151.5 686.102L594.007 1090.33L593.375 1090.79L35.8823 686.564Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1167.2 691.608L947.989 17.2698H238.753L19.5298 691.608L593.36 1108.37L1167.2 691.608ZM18.1106 692.567L17.625 692.229L237.583 15.6666H949.167L1169.12 692.229L593.838 1110.03L593.364 1110.38L18.1106 692.567Z"
            fill="white"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M226.683 0L226.559 0.395108L0 697.129L0.338839 697.377L593.375 1128L593.703 1127.75L1186.75 697.129L1186.64 696.745L960.078 0H226.683ZM1.3234 696.7L227.521 1.11758H959.244L1185.43 696.7L593.377 1126.59L1.3234 696.7Z"
            fill="white"
          />
        </g>
      </svg>

      <div className="max-w-5xl mx-auto flex flex-col items-center gap-10 relative z-10">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-sm sm:text-base text-white/60 mt-3">
            No contracts. No surprise fees.
          </p>
        </div>

        {/* Monthly / Yearly Toggle */}
        <div className="flex items-center gap-1 bg-white/10 rounded-full p-1">
          <button
            onClick={() => setBillingYearly(false)}
            className={`px-6 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all cursor-pointer ${
              !billingYearly
                ? "bg-[#1E5A69] text-white shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingYearly(true)}
            className={`px-6 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all cursor-pointer ${
              billingYearly
                ? "bg-white text-[#133139] shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            Yearly
          </button>
        </div>

        {/* Pricing Cards Container */}
        <div className="w-full bg-white rounded-[28px] shadow-2xl p-6 lg:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            {featuredCards.map((plan, idx) => (
              <div
                key={idx}
                className={`relative flex flex-col rounded-[20px] p-6 transition-all duration-300 ${
                  plan.featured
                    ? "bg-[#133139] text-white shadow-xl scale-[1.03] z-10"
                    : "bg-white text-[#0B252C] border border-gray-100"
                }`}
              >
                {/* Most Popular Badge */}
                {plan.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-[#C56C39] text-white text-[11px] font-bold px-4 py-1.5 rounded-full uppercase tracking-wider whitespace-nowrap shadow-md">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Price */}
                <div className="mb-1 mt-3 flex flex-col">
                  <div className="flex items-baseline">
                    <span
                      className={`text-4xl font-extrabold tracking-tight ${
                        plan.featured ? "text-white" : "text-[#0B252C]"
                      }`}
                    >
                      {billingYearly ? plan.annualAmount : `$${plan.price.monthly}`}
                    </span>
                    <span
                      className={`text-sm font-medium ml-1 ${
                        plan.featured ? "text-white/70" : "text-[#4A5F64]"
                      }`}
                    >
                      {billingYearly ? "/year" : "/month"}
                    </span>
                  </div>
                  {billingYearly && (
                    <span
                      className={`text-[11px] font-semibold mt-1 transition-all ${
                        plan.featured ? "text-[#9BDD7C]" : "text-[#1E5A69]"
                      }`}
                    >
                      Billed annually (${plan.price.yearly}/mo equivalent)
                    </span>
                  )}
                </div>

                {/* Users */}
                <h3
                  className={`text-lg font-extrabold mb-3 ${
                    plan.featured ? "text-white" : "text-[#0B252C]"
                  }`}
                >
                  {plan.users}
                </h3>

                {/* Description */}
                <p
                  className={`text-xs leading-relaxed mb-5 ${
                    plan.featured ? "text-white/70" : "text-[#4A5F64]"
                  }`}
                >
                  {plan.description}
                </p>

                {/* Feature list */}
                <ul className="flex flex-col gap-2.5 mb-6 flex-1">
                  {pricingFeatures.map((feature, fi) => (
                    <li key={fi} className="flex items-center gap-2.5">
                      <svg
                        viewBox="0 0 16 16"
                        className={`w-4 h-4 shrink-0 ${
                          plan.featured ? "text-[#9BDD7C]" : "text-[#82C341]"
                        }`}
                        fill="currentColor"
                      >
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                      </svg>
                      <span
                        className={`text-xs font-medium ${
                          plan.featured ? "text-white/90" : "text-[#0B252C]"
                        }`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => handleChoosePlan(plan.key)}
                  className={`w-full py-3 rounded-[12px] text-sm font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    plan.featured
                      ? "bg-[#9BDD7C] text-[#0B252C] hover:bg-[#8fd16e] shadow-lg"
                      : "bg-[#F0F7EC] text-[#4A5F64] hover:bg-[#9BDD7C]/30 hover:text-[#0B252C]"
                  }`}
                >
                  Choose plan
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Slide-Down Expanded Detailed Table */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -16, scale: 0.99 }}
              animate={{ height: "auto", opacity: 1, y: 0, scale: 1 }}
              exit={{ height: 0, opacity: 0, y: -16, scale: 0.99 }}
              transition={{
                height: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.35, ease: "easeOut" },
                y: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                scale: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
              }}
              className="w-full overflow-hidden py-1"
            >
              <div className="w-full max-w-5xl mx-auto bg-white rounded-[28px] shadow-2xl p-6 sm:p-8 lg:p-10 relative text-[#0B252C]">
                {/* Save 17% badge in top right */}
                <div className="flex justify-end mb-2">
                  <span className="bg-[#C56C39] text-white text-[13px] font-bold px-4 py-2 rounded-xl inline-block shadow-md">
                    Annual billing saves you 17%
                  </span>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 pb-4 border-b border-gray-100 items-end px-2 sm:px-4">
                  <div className="col-span-5 text-left">
                    <h3 className="text-2xl sm:text-[26px] font-extrabold text-[#0B252C] leading-none mb-1">
                      Team Size
                    </h3>
                    <p className="text-xs sm:text-[13px] text-[#4A5F64] font-medium">
                      Knowing your team size help you choose appropriately.
                    </p>
                  </div>
                  <div
                    className={`col-span-2 text-center transition-all ${
                      !billingYearly ? "" : "opacity-40"
                    }`}
                  >
                    <span className="text-xs sm:text-[15px] text-[#0B252C] font-bold block">
                      Monthly
                    </span>
                    <span
                      className={`block h-0.5 w-8 mx-auto mt-1 rounded-full transition-all ${
                        !billingYearly ? "bg-[#9BDD7C]" : "bg-transparent"
                      }`}
                    />
                  </div>
                  <div
                    className={`col-span-2 text-center transition-all ${
                      billingYearly ? "" : "opacity-40"
                    }`}
                  >
                    <span className="text-xs sm:text-[15px] text-[#0B252C] font-bold block leading-tight">
                      Annual
                    </span>
                    <span className="text-[11px] sm:text-[12px] text-[#4A5F64] block leading-tight font-medium">
                      (2 months free)
                    </span>
                    <span
                      className={`block h-0.5 w-8 mx-auto mt-1 rounded-full transition-all ${
                        billingYearly ? "bg-[#9BDD7C]" : "bg-transparent"
                      }`}
                    />
                  </div>
                  <div className="col-span-3 text-right" />
                </div>

                {/* Table Rows */}
                <div className="flex flex-col mt-2 divide-y divide-gray-50">
                  {allPricingPlans.map((plan) => {
                    const isHovered = hoveredKey === plan.key;
                    return (
                      <div
                        key={plan.key}
                        onMouseEnter={() => setHoveredKey(plan.key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        onClick={() => handleChoosePlan(plan.key)}
                        className="relative group cursor-pointer transition-all duration-150"
                      >
                        <div
                          className={`absolute inset-y-1 left-[-8px] right-[-8px] sm:left-[-12px] sm:right-[-12px] rounded-[16px] transition-all duration-150 z-0 ${
                            isHovered ? "bg-[#1E5A69] shadow-lg" : "bg-transparent"
                          }`}
                        />
                        <div className="grid grid-cols-12 gap-4 items-center py-3.5 px-2 sm:px-4 relative z-10">
                          <div className="col-span-5 text-left">
                            <span
                              className={`text-sm sm:text-[16px] font-bold block transition-colors ${
                                isHovered ? "text-white" : "text-[#0B252C]"
                              }`}
                            >
                              {plan.users}
                            </span>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-lg text-xs sm:text-[15px] font-bold transition-all ${
                                !billingYearly
                                  ? isHovered
                                    ? "bg-white/20 text-white"
                                    : "bg-[#9BDD7C]/20 text-[#0B252C]"
                                  : isHovered
                                  ? "text-white/50"
                                  : "text-[#0B252C]/40 font-normal"
                              }`}
                            >
                              {plan.monthlyAmount}
                            </span>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-lg text-xs sm:text-[15px] font-bold transition-all ${
                                billingYearly
                                  ? isHovered
                                    ? "bg-white/20 text-white"
                                    : "bg-[#9BDD7C]/20 text-[#0B252C]"
                                  : isHovered
                                  ? "text-white/50"
                                  : "text-[#0B252C]/40 font-normal"
                              }`}
                            >
                              {plan.annualAmount}
                            </span>
                          </div>
                          <div className="col-span-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleChoosePlan(plan.key);
                              }}
                              className={`px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm ${
                                isHovered
                                  ? "bg-[#9BDD7C] text-[#0B252C] hover:bg-[#8fd16e] shadow-md scale-[1.02]"
                                  : "bg-[#E6F3E6] text-[#2F6532] hover:bg-[#9BDD7C]/30"
                              }`}
                            >
                              Choose plan
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* View All Plans / Collapse CTA Actions */}
        {!isExpanded ? (
          <button
            onClick={() => setIsExpanded(true)}
            className="px-8 py-3.5 bg-[#B35E31] text-white text-sm font-bold rounded-full shadow-lg hover:bg-[#9e5229] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
          >
            View All Available Plans
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              onClick={() => setIsExpanded(false)}
              className="px-8 py-3.5 bg-[#1E5A69] text-white text-sm font-bold rounded-full shadow-lg border border-white/20 hover:bg-[#15424d] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
            >
              See less Plans
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>

            <Link href="/register">
              <button className="px-8 py-3.5 bg-[#C56C39] text-white text-sm font-bold rounded-full shadow-lg hover:bg-[#b25e2e] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
                Contact Us for Enterprise
              </button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
