import { render } from "preact";
import { useState } from "preact/hooks";

interface AttributedAsset {
  name: string;
  author: string;
  license: string;
  url: string;
}

// CC BY assets used by the theme require attribution -- see ATTRIBUTIONS.md for the full list
// including CC0 assets, which don't legally require this but are recorded there too.
const ATTRIBUTED_ASSETS: AttributedAsset[] = [
  { name: "Sun icon", author: "Lorc", license: "CC BY 3.0", url: "https://game-icons.net/1x1/lorc/sun.html" },
  { name: "Moon icon", author: "Lorc", license: "CC BY 3.0", url: "https://game-icons.net/1x1/lorc/moon.html" },
];

export function Credits() {
  const [open, setOpen] = useState(false);

  return (
    <div class="credits-widget">
      <button type="button" class="credits-trigger" data-credits-trigger onClick={() => setOpen((value) => !value)}>
        Credits
      </button>
      {open && (
        <div class="credits-panel" data-credits-panel>
          <h3>Asset Credits</h3>
          <ul>
            {ATTRIBUTED_ASSETS.map((asset) => (
              <li key={asset.name}>
                <a href={asset.url} target="_blank" rel="noreferrer">
                  {asset.name}
                </a>{" "}
                by {asset.author} ({asset.license})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function mountCredits(): void {
  const container = document.createElement("div");
  container.id = "credits";
  document.body.appendChild(container);
  render(<Credits />, container);
}
