import { LOADING_GIF_SRC } from "./constants";
import { classNames, devOutline } from "./ui";

type LoadingOverlayProps = {
  devBorders: boolean;
  loadingOverlayActive: boolean;
  transitionActive: boolean;
};

export function LoadingOverlay({
  devBorders,
  loadingOverlayActive,
  transitionActive,
}: LoadingOverlayProps) {
  return (
    <div
      className={classNames(
        "fixed inset-0 z-40 flex items-center justify-center bg-black transition-opacity duration-200",
        loadingOverlayActive ? "opacity-100" : "opacity-0",
        transitionActive ? "pointer-events-auto" : "pointer-events-none",
        devOutline(devBorders, 4),
      )}
      aria-hidden="true"
    >
      {loadingOverlayActive ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={LOADING_GIF_SRC}
          alt=""
          className="block w-96 select-none md:w-[30rem]"
          draggable={false}
        />
      ) : null}
    </div>
  );
}
