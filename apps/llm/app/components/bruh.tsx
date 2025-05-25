import {
  useBruh,
  useExternalNavigation,
  useWindowDimensions,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function Bruh() {
  const windowDimensions = useWindowDimensions();
  const {
    dimensions,
    position,
    eyePosition,
    isBlinking,
    isHovered,
    setIsHovered,
  } = useBruh();
  const { navigate } = useExternalNavigation();

  const windowLoaded =
    windowDimensions.width > 0 && windowDimensions.height > 0;

  return (
    <div
      onMouseDown={() => navigate("https://bnle.me")}
      className={cn(
        "fixed z-20 cursor-pointer rounded-full",
        "transition-all duration-800 ease-in-out",
      )}
      style={{
        top: windowLoaded
          ? position.y
          : `calc(50% - ${dimensions.height / 2}px)`,
        left: windowLoaded
          ? position.x
          : `calc(50% - ${dimensions.width / 2}px)`,
      }}
    >
      <div
        className={cn(
          "relative rounded-full",
          "transition-all duration-300 hover:scale-110",
          "shadow-lg hover:shadow-xl",
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <svg
          width={dimensions.width}
          height={dimensions.height}
          viewBox="0 0 600 600"
          className="overflow-visible"
          aria-label="Bruh that follows mouse movement"
          role="img"
        >
          <defs>
            <style>
              {`
              .eye-ellipse, .mouth-ellipse {
                transition: all 0.3s ease-in-out;
              }
            `}
            </style>
          </defs>

          {/* Face */}
          <circle cx="300" cy="300" r="300" className="fill-royal-yellow" />

          {/* Eyes */}
          {[198, 401].map((cx) => (
            <g
              key={`eye-${cx}`}
              transform={`translate(${eyePosition.x} ${eyePosition.y})`}
            >
              <ellipse
                cx={cx}
                cy="218"
                rx="40"
                ry={isBlinking ? 4 : isHovered ? 20 : 10}
                className="eye-ellipse fill-bruh-eye"
              >
                <animate
                  attributeName="ry"
                  values="5;1;5"
                  dur="0.3s"
                  begin={isBlinking ? "0s" : "indefinite"}
                />
              </ellipse>
            </g>
          ))}

          {/* Mouth */}
          <g transform={`translate(${eyePosition.x} ${eyePosition.y})`}>
            <ellipse
              cx="307"
              cy="378"
              rx="120"
              ry={isHovered ? 40 : 10}
              className="mouth-ellipse fill-bruh-mouth"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
