import { CATALOGUE_META } from '../../generated/catalogue.meta';
import { CATALOGUE, FAMILIES, FAMILY_WEIGHT } from '../../domain/catalogue';
import { MAX_SCORE, MIN_SCORE, TOTAL_WEIGHT } from '../../scoring/constants';
import { titleCaseFamily } from '../../lib/format';

export function AboutView(): React.ReactElement {
  return (
    <main className="page" id="main">
      <h1>About this tool</h1>

      <div className="stack">
        <section className="card">
          <h2>What it is not</h2>
          <ul>
            <li>
              <b>Not official.</b> Not affiliated with, endorsed by, or approved by DCMA, the DIBCAC,
              the DoD, or any US Government agency. No government seal, logo, or other branding is
              used anywhere in this application.
            </li>
            <li>
              <b>Not a submission.</b> The score shown is computed with the SPRS methodology, but it
              is a self-computed estimate. Nothing is transmitted to SPRS or anywhere else.
            </li>
            <li>
              <b>Not Revision 3.</b> This is the <b>NIST SP 800-171 Revision 2</b> catalogue: 110
              requirements, 320 assessment objectives. Rev 3 restructures the control set; if your
              contract invokes Rev 3, this tool does not match it.
            </li>
            <li>
              <b>Not legal or contractual advice.</b> Eligibility rules — including which
              requirements may sit on a POA&amp;M — live in 32 CFR Part 170 and your contract, not
              in this app.
            </li>
          </ul>
        </section>

        <section className="card">
          <h2>Provenance</h2>
          <p>
            All requirement identifiers, descriptions, discussions, assessment objectives, point
            weights and evidence standards are reproduced from a publicly released DCMA DIBCAC
            self-assessment database:
          </p>
          <figure className="sourcequote">
            <blockquote>{CATALOGUE_META.sourceDatabase}</blockquote>
            <figcaption>
              Extracted to <span className="mono">{CATALOGUE_META.sourceFile}</span>, compiled into
              this application at build time. Catalogue SHA-256{' '}
              <span className="mono">{CATALOGUE_META.catalogueHash.slice(0, 16)}…</span>
            </figcaption>
          </figure>
          <p className="small muted">
            {CATALOGUE_META.requirementCount} requirements · {CATALOGUE_META.objectiveCount}{' '}
            assessment objectives · {CATALOGUE_META.familyCount} families · total available
            deduction {CATALOGUE_META.totalWeight} points.
          </p>
          <div className="editorial">
            <span className="editorial__tag">Editorial note — ours, not the source&rsquo;s</span>
            The source file contains no &ldquo;typical questions asked&rdquo; or &ldquo;typical
            technologies&rdquo; data, despite one stale query inside it referring to such columns.
            Any framing in the Evidence view about what an assessor might ask for is built from the
            objective text and the evidence standard, plus our own gloss, which is always marked
            with this treatment.
          </div>
        </section>

        <section className="card">
          <h2>How the score is computed</h2>
          <p>
            Every assessment starts at <b>{MAX_SCORE}</b>. Each requirement that is not met deducts
            its weight. Total available deduction is <b>{TOTAL_WEIGHT}</b>, so the floor is{' '}
            <b>{MIN_SCORE}</b> — and both numbers are derived from the data at build time, never
            hard-coded.
          </p>
          <p>The cascade is transliterated directly from the source database&rsquo;s summary query:</p>
          <figure className="sourcequote">
            <blockquote>
              {`IIf([Requirement_Satisfied]=True, 0,
IIf([Requirement_Other_Than_Satisfied]=True, [Requirement_Score],
IIf([Requirement_Special_Considerations_Satisfied]=True,
    [Requirement_Special_Considerations_Score], 0)))`}
            </blockquote>
            <figcaption>Qry_Summary, verbatim from the source database.</figcaption>
          </figure>
          <div className="editorial">
            <span className="editorial__tag">Design decision — ours</span>
            The source stores three independent yes/no flags that can contradict each other, and its
            two scoring queries disagree about what a contradiction means: one checks
            &ldquo;satisfied&rdquo; first, the other never checks it at all. We model status as a
            single choice so the contradiction cannot be entered in the first place, and we
            implement the summary query&rsquo;s precedence: satisfied beats not-satisfied beats
            partial credit.
          </div>
          <p className="small muted">
            Completeness is computed as assessed &divide; {CATALOGUE.length}. The source&rsquo;s own
            percent-complete query adds three booleans together and can double-count a requirement
            flagged more than one way, so it is deliberately not reproduced.
          </p>
          <p className="small muted">
            Assessment objectives are recorded for your own tracking and for the evidence list.
            Consistent with the source database, they do <b>not</b> affect the score, and this tool
            will not silently roll them up into a requirement status — that would be inventing
            methodology.
          </p>
        </section>

        <section className="card">
          <h2>Privacy — precisely what is and is not true</h2>
          <ul>
            <li>
              <b>No network requests at runtime.</b> The requirement catalogue is compiled into the
              JavaScript bundle rather than fetched. The page ships a Content Security Policy with{' '}
              <span className="mono">connect-src &lsquo;none&rsquo;</span>, which blocks fetch, XHR,
              beacons, and WebSockets outright.
            </li>
            <li>
              <b>No analytics, no error reporting, no cookies, no fonts from a CDN.</b>
            </li>
            <li>
              <b>Your assessment is stored in this browser&rsquo;s local storage</b> under the key{' '}
              <span className="mono">cmmc-sa:v1:assessment</span>. Local storage is scoped to the
              origin, not the path, so it is namespaced to avoid colliding with anything else hosted
              on the same domain.
            </li>
            <li>
              <b>Limitation we will not overclaim:</b> the CSP is delivered in a{' '}
              <span className="mono">&lt;meta&gt;</span> tag, and{' '}
              <span className="mono">frame-ancestors</span> is ignored in meta CSP. Static hosting
              cannot set response headers, so this page has no real protection against being framed
              by another site. Do not enter anything into it from inside an untrusted frame.
            </li>
            <li>
              <b>Exported files contain your entire assessment.</b> Treat an export the way you
              would treat your System Security Plan.
            </li>
          </ul>
        </section>

        <section className="card">
          <h2>Weight distribution</h2>
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Family</th>
                  <th className="num">Requirements</th>
                  <th className="num">Points at stake</th>
                </tr>
              </thead>
              <tbody>
                {FAMILIES.map((f) => (
                  <tr key={f.familyNumber}>
                    <td className="mono">{f.cmmcDomain}</td>
                    <td>
                      {titleCaseFamily(f.familyName)}{' '}
                      <span className="faint mono tiny">{f.familyNumber}</span>
                    </td>
                    <td className="num">{f.requirements.length}</td>
                    <td className="num">{FAMILY_WEIGHT.get(f.familyNumber)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th />
                  <th>Total</th>
                  <th className="num">{CATALOGUE.length}</th>
                  <th className="num">{TOTAL_WEIGHT}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>Licence</h2>
          <p className="small">
            The application code is MIT licensed. The requirement catalogue is derived from a US
            Government work released to the public by DCMA; it is reproduced here for
            interoperability and is unmodified in substance. This project claims no rights over it
            and no association with its authors.
          </p>
        </section>
      </div>
    </main>
  );
}
