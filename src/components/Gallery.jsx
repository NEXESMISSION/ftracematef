export default function Gallery() {
  return (
    <section id="gallery" className="gallery tm-section-pad">
      <div className="section-head">
        <p className="kicker hand">made with love</p>
        <h2>For creators like you.</h2>
      </div>

      <div className="gallery-grid">
        <figure className="g-frame g-1">
          <img src="/images/gallery/polaroid-collage.webp" alt="Polaroid collage of artwork" />
        </figure>
        <figure className="g-frame g-2">
          <img src="/images/gallery/polaroid-scene.webp" alt="Polaroid scene of art tools and a cat sketch" />
        </figure>
        <figure className="g-frame g-3">
          <img
            src="/images/gallery/testimonial.webp"
            alt="Trace Mate makes tracing so easy and fun. It feels like magic! — Sarah K., 5 stars."
          />
        </figure>
        <figure className="g-card-bordered g-4">
          <img src="/images/gallery/cat-pencil.webp" alt="Cat illustration with pencil" />
          <figcaption className="g-caption print">Your sketchbook&apos;s new favorite tool.</figcaption>
        </figure>
      </div>
    </section>
  );
}
