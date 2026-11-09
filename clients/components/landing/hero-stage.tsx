import Link from "next/link";
import { FitStage } from "@/components/landing/fit-stage";

const TERRITORIES = ["Lagos", "Accra", "Nairobi", "Abidjan"];

export function HeroStage() {
  return (
    <section className="se-hero" aria-labelledby="hero-title">
      <div className="se-shard se-shard-a" aria-hidden="true" />
      <div className="se-shard se-shard-b" aria-hidden="true" />
      <div className="se-wrap">
        <div className="se-hero-grid">
          <div>
            <h1 id="hero-title" className="se-rise">
              Write who you sell to.
            </h1>
            <p className="se-lede se-rise se-rise-2">
              Sales Engine looks for companies in that territory, keeps the ones that fit the profile, and leaves a note you can send.
            </p>
            <form className="se-start se-rise se-rise-3" action="/register" method="get">
              <label className="sr-only" htmlFor="profile-seed">
                Trade, territory, and size
              </label>
              <input
                id="profile-seed"
                name="profile"
                type="text"
                placeholder="Trade, territory, size"
                autoComplete="off"
              />
              <button className="se-btn se-btn-solid" type="submit">
                Get started
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 12 12 4M12 4H6.5M12 4v5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
            <p className="se-login-line se-rise se-rise-3">
              Already registered? <Link href="/login">I already have an account</Link>
            </p>
          </div>
          <FitStage />
        </div>
        <ul className="se-marks" aria-label="Active discovery territories">
          {TERRITORIES.map((place) => (
            <li key={place}>{place}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
