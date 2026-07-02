type CreditsModalProps = {
  onClose: () => void;
};

export function CreditsModal({ onClose }: CreditsModalProps) {
  return (
    <div
      className="fixed inset-0 z-[48] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="font-paper-planet relative w-full max-w-[min(34rem,calc(100vw-2rem))] border border-white/55 bg-black/90 px-6 py-5 text-center text-white shadow-2xl sm:px-8 sm:py-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paper-planet-credits-title"
        data-stage-interactive="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-2 cursor-pointer text-3xl leading-none text-white/65 hover:text-white"
          aria-label="Close credits"
          onClick={onClose}
        >
          &times;
        </button>
        <h2
          id="paper-planet-credits-title"
          className="text-[2.1rem] leading-none text-white sm:text-[2.6rem]"
        >
          Credits
        </h2>
        <div className="mt-5 grid gap-3 text-[1.45rem] leading-[0.92] text-white/82 sm:text-[1.85rem]">
          <p>Created by Connor Schultze</p>
          <p>
            Web development by{" "}
            <a
              href="https://andrew-boylan.com"
              target="_blank"
              rel="noreferrer"
              className="font-pyxis text-white underline decoration-white/45 underline-offset-4 hover:decoration-white"
            >
              Regular Expression
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
