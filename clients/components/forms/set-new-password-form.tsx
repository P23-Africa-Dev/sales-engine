"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { useState } from "react";

export default function SetNewPasswordForm() {
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="relative mb-6">
        <Input 
          type={showPassword1 ? "text" : "password"} 
          placeholder="New Password" 
          className="w-full pr-12" 
        />
        <button 
          type="button" 
          onClick={() => setShowPassword1(!showPassword1)}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {showPassword1 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" />
               <path d="M12 14v4" />
               <path d="M8.5 13.5l-2 3" />
               <path d="M15.5 13.5l2 3" />
            </svg>
          )}
        </button>
      </div>

      <div className="relative mb-12">
        <Input 
          type={showPassword2 ? "text" : "password"} 
          placeholder="Confirm New Password" 
          className="w-full pr-12" 
        />
        <button 
          type="button" 
          onClick={() => setShowPassword2(!showPassword2)}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {showPassword2 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" />
               <path d="M12 14v4" />
               <path d="M8.5 13.5l-2 3" />
               <path d="M15.5 13.5l2 3" />
            </svg>
          )}
        </button>
      </div>

      <Button>Reset Password</Button>
    </div>
  );
}
