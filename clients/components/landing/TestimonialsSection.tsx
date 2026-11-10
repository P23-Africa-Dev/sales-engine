"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

const testimonials = [
  {
    quote:
      "Factory 23 completely eliminated our visibility blind spots. Being able to track field agents and sync visit reports even in remote zero connectivity areas transformed our distribution efficiency across 12 regions.",
    name: "John D.",
    role: "VP of Field Operations, OmniDistribution",
    avatar: "/avatars/john_avatar.png",
    bgColor: "bg-[#FDF2FB]",
    borderColor: "border-[#FAD8F7]",
  },
  {
    quote:
      "Our field sales reps save over 10 hours a week with the ELY AI assistant and automated visit logging. We closed 35% more field leads in our very first quarter using Factory 23.",
    name: "Toure Y.",
    role: "Head of Sales & CRM, Apex FMCG",
    avatar: "/avatars/touka_avatar.png",
    bgColor: "bg-white",
    borderColor: "border-gray-100",
    shadow: "shadow-lg shadow-gray-100/50",
  },
  {
    quote:
      "Scaling our field workforce from 5 to 50+ agents was completely seamless. The transparent seat pricing and automated KPI performance dashboards gave our executive team actionable insights from day one.",
    name: "John N.",
    role: "Chief Operating Officer, Vanguard Energy",
    avatar: "/avatars/donald_avatar.png",
    bgColor: "bg-[#F0FDF8]",
    borderColor: "border-[#D1F7E2]",
  },
  {
    quote:
      "Implementing Factory 23's field tracking matrix transformed our dispatch operations. Real time task assignments and location verified check ins keep our entire field force in sync.",
    name: "Sarah M.",
    role: "Operations Director, Summit Field Services",
    avatar: "/avatars/female-avatar.png",
    bgColor: "bg-[#FDF2FB]",
    borderColor: "border-[#FAD8F7]",
  },
  {
    quote:
      "We evaluated several platforms, but none offered the offline reliability of Factory 23. Our field agents love the PWA app's speed, clean UI, and instant offline sync.",
    name: "David K.",
    role: "Logistics Manager, Horizon Supply Chain",
    avatar: "/avatars/male-avatar.png",
    bgColor: "bg-white",
    borderColor: "border-gray-100",
    shadow: "shadow-lg shadow-gray-100/50",
  },
  {
    quote:
      "The seamless integration with our customer database and reliable GPS backed attendance verification allowed us to scale rapidly while maintaining strict operational quality.",
    name: "Elena R.",
    role: "Head of Product, Nexa Infrastructure",
    avatar: "/avatars/female-avatar-old.png",
    bgColor: "bg-[#F0FDF8]",
    borderColor: "border-[#D1F7E2]",
  },
];

export default function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNext = () => {
    if (isDesktop) {
      setCurrentIndex((prev) => (prev === 0 ? 3 : 0));
    } else {
      setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
    }
  };

  const handlePrev = () => {
    if (isDesktop) {
      setCurrentIndex((prev) => (prev === 0 ? 3 : 0));
    } else {
      setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
    }
  };

  const handleDotClick = (idx: number) => {
    if (isDesktop) {
      setCurrentIndex(idx * 3);
    } else {
      setCurrentIndex(idx);
    }
  };

  const translatePercent = isDesktop ? Math.floor(currentIndex / 3) * 100 : currentIndex * 100;
  const totalDots = isDesktop ? 2 : testimonials.length;

  return (
    <section id="reviews" className="w-full bg-[#F8FAFC] py-20 lg:py-28 px-6 sm:px-12 lg:px-24 font-sans relative overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col items-center">
        
        {/* Header */}
        <div className="text-center max-w-3xl mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-[#0B252C] tracking-tight">
            What Our Clients Say About Us
          </h2>
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mt-4">
            Discover the experiences of our satisfied customers! Read their testimonials to learn how our services have made a positive impact on their businesses.
          </p>
        </div>

        {/* Carousel Viewport Container */}
        <div className="w-full relative flex items-center gap-4 sm:gap-6">
          {/* Left Navigation Button */}
          <button
            onClick={handlePrev}
            aria-label="Previous testimonial"
            className="absolute left-[-16px] lg:left-[-24px] z-20 w-12 h-12 rounded-full bg-white hidden lg:flex items-center justify-center border border-gray-100 shadow-md hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-[#0B252C] stroke-[2.5]" />
          </button>

          {/* Carousel Inner Container */}
          <div 
            className="w-full overflow-hidden px-2 py-4 cursor-grab active:cursor-grabbing"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${translatePercent}%)` }}
            >
              {testimonials.map((item, idx) => (
                <div
                  key={idx}
                  className="w-full lg:w-1/3 shrink-0 px-3 sm:px-4 flex justify-center"
                >
                  <div
                    className={`w-full max-w-xl mx-auto lg:max-w-none rounded-2xl border p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-md ${item.bgColor} ${item.borderColor} ${item.shadow || ""}`}
                  >
                    <p className="text-[15px] sm:text-base text-[#4A5F64] leading-relaxed italic mb-8">
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-100">
                        <Image
                          src={item.avatar}
                          alt={item.name}
                          width={48}
                          height={48}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-[#0B252C]">
                          {item.name}
                        </h4>
                        <p className="text-xs text-[#4A5F64] font-medium">
                          {item.role}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Navigation Button */}
          <button
            onClick={handleNext}
            aria-label="Next testimonial"
            className="absolute right-[-16px] lg:right-[-24px] z-20 w-12 h-12 rounded-full bg-white hidden lg:flex items-center justify-center border border-gray-100 shadow-md hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5 text-[#0B252C] stroke-[2.5]" />
          </button>
        </div>

        {/* Indicator Dots */}
        <div className="flex items-center gap-2.5 mt-10">
          {Array.from({ length: totalDots }).map((_, idx) => {
            const isActive = isDesktop
              ? Math.floor(currentIndex / 3) === idx
              : currentIndex === idx;
            return (
              <button
                key={idx}
                onClick={() => handleDotClick(idx)}
                aria-label={`Go to slide page ${idx + 1}`}
                className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  isActive ? "w-6 bg-[#0B252C]" : "w-2.5 bg-[#0B252C]/30 hover:bg-[#0B252C]/50"
                }`}
              />
            );
          })}
        </div>

      </div>
    </section>
  );
}
