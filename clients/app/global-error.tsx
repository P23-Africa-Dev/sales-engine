"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-[#F8FAFA] px-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0px_1px_3px_1px_#00000026] text-center">
          <p className="text-sm font-semibold text-[#6FA8A6] mb-2">
            Something went wrong
          </p>
          <h1 className="text-xl font-bold text-[#34373C] mb-2">
            We hit an unexpected error.
          </h1>
          <p className="text-sm text-[#7A7C80] mb-5">
            Please try again. If the issue continues, contact support.
          </p>
          <button
            onClick={() => unstable_retry()}
            className="w-full h-[46px] rounded-full bg-[#6FA8A6] text-white text-sm font-medium hover:bg-[#5e9795] transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
