import Link from "next/link";

function Waves() {
  return (
    <svg className="se-waves" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M8 14c2.2-3 4.2-3 6.2 0s4 3 6.2 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 18.5c2.2-3 4.2-3 6.2 0s4 3 6.2 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FitStage() {
  return (
    <figure className="se-stage se-rise se-rise-4">
      <div className="se-record">
        <div className="se-record-top">
          <div className="se-avatar" aria-hidden="true">
            LF
          </div>
          <div>
            <strong>Lagos Fresh Mills</strong>
            <span>Sample profile · Lagos</span>
          </div>
        </div>
        <p className="se-amount">
          <small>People on the ground</small>
          <strong>80–120</strong>
        </p>
        <dl className="se-rows">
          <div className="se-row">
            <dt>Trade</dt>
            <dd>Packaged foods</dd>
          </div>
          <div className="se-row">
            <dt>Territory</dt>
            <dd>Nigeria and Ghana</dd>
          </div>
        </dl>
        <p className="se-slip">
          <span>Left the list</span>
          <b>Northline Cold Store</b>
        </p>
        <Link href="/register" className="se-btn se-btn-navy">
          Open a profile
        </Link>
      </div>
      <div className="se-pass" aria-hidden="true">
        <div className="se-pass-top">
          <p>Qualified</p>
          <strong>Lagos Fresh Mills</strong>
          <em>80–120</em>
        </div>
        <div className="se-pass-bottom">
          <b>NOTE</b>
          <Waves />
        </div>
      </div>
      <figcaption className="se-caption">Example board. Not a customer list.</figcaption>
    </figure>
  );
}
