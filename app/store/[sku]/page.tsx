import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession, page } from "@/lib/domain";
import { store } from "@/lib/store";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function StorePage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const id = (await cookies()).get("mr-session")?.value;
  if (!id)
    return (
      <main className="standalone">
        <h1>A storefront of your own.</h1>
        <p>Start a private demonstration session first.</p>
        <Link href="/">Open MerchReflex →</Link>
      </main>
    );
  let s;
  try {
    s = await getSession(store(), id);
  } catch {
    notFound();
  }
  if ((await params).sku !== s.sku) notFound();
  const v = page(s);
  const snapshot = JSON.stringify({
    version: v.version,
    content: v.content,
  }).replace(/</g, "\\u003c");
  return (
    <main className="store-site">
      <nav>
        <Link href="/">← Back to MerchReflex</Link>
        <span>DEMONSTRATION STOREFRONT · VERSION {v.version}</span>
      </nav>
      <div className="store-brand">
        FIELDWORK<span>Objects for the everyday.</span>
      </div>
      <section className="store-grid">
        <figure>
          <img
            src="/commuter-one.png"
            alt="AI-generated demo: olive backpack beside a cream bottle"
          />
          <figcaption>{v.content.imageCaption}</figcaption>
          <small>AI-generated image · synthetic product</small>
        </figure>
        <article>
          <span className="eyebrow">THE COMMUTER COLLECTION</span>
          <h1>{s.name}</h1>
          <p className="store-description">{v.content.shortDescription}</p>
          <span className="store-price">
            $89.00 <small>Demo price · no checkout</small>
          </span>
          <div className="product-detail">
            <h3>Good to know</h3>
            <p style={{ whiteSpace: "pre-line" }}>{v.content.faq}</p>
          </div>
          <p className="muted">
            This is an isolated demo storefront. Content changes are real and
            versioned; the product and specifications are synthetic.
          </p>
        </article>
      </section>
      <script
        id="storefront-data"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: snapshot }}
      />
    </main>
  );
}
