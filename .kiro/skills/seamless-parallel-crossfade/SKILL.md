---
name: seamless-parallel-crossfade
description: Implementation guide and pattern for smooth 0.6s parallel linear UI cross-fades without zoom transforms, loading screen flashes, or child animation fill-mode locking.
---

# Seamless Parallel UI Cross-Fade Pattern

This skill documents the pattern for achieving 100% smooth, simultaneous UI screen transitions (e.g. from item selection grid to item detail/dealer view) with linear opacity cross-fading.

## Core Design Principles

1. **Simultaneous Parallel Cross-Fade**:
   - Outgoing view fades out **opacity 1.0 → 0.0** over 0.4s (400ms) with linear easing.
   - Incoming view fades in **opacity 0.0 → 1.0** over 0.4s (400ms) with linear easing at the exact same instant.
   - Both views coexist in the DOM simultaneously during the 400ms transition.

2. **Zero Scale / Zero Zoom Motion**:
   - Avoid scale transforms (`scale-95`, `scale-105`, `scale-[2.0]`) during screen transitions to prevent disorienting zoom motions.

3. **No Unnecessary Loading Screen**:
   - Fast PCs / cached assets cross-fade directly with 0ms delay.
   - Loading overlays only trigger via a 500ms safety timer as a fallback for slow computers or delayed network requests.

4. **No Dark Vignettes**:
   - Avoid heavy radial vignette overlays (`rgba(9,9,11,0.85) 65%`) that obscure screen edges. Use light linear gradients instead.

5. **Symmetrical Reverse Cross-Fade on Back Navigation**:
   - When clicking the Back button, the active detail/dealer view runs `animate-crossFadeOut` (**opacity 1.0 → 0.0** over 0.4s).
   - Simultaneously, the selection grid view mounts and runs `animate-crossFadeIn` (**opacity 0.0 → 1.0** over 0.4s).
   - State (`setSelectedBrand('All')`) is finalized at 400ms when the reverse cross-fade finishes.

---

## Critical Bug to Avoid: Child Animation Fill-Mode Locking

### The Bug
If child elements (e.g. selection cards) use a CSS keyframe animation with `animation-fill-mode: both` or `forwards` (such as `.animate-brandPop`), the browser locks `opacity: 1` onto the child elements. Parent `div` opacity transitions (e.g. `opacity-100` → `opacity-0`) will fail to hide child elements.

### The Fix
Strip child keyframe animation utility classes while the cross-fade is active:
```tsx
className={`... ${!brandCrossFadeTarget ? 'animate-brandPop' : ''}`}
```

---

## React State & Handler Implementation

```tsx
// State to hold the target selection during the 400ms cross-fade
const [brandCrossFadeTarget, setBrandCrossFadeTarget] = useState<string | null>(null);
const dealerBrandTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleBrandSelect = React.useCallback((brand: string) => {
  if (brandCrossFadeTarget !== null) return;
  
  // Start cross-fade transition
  setBrandCrossFadeTarget(brand);

  if (dealerBrandTransitionTimeoutRef.current) {
    clearTimeout(dealerBrandTransitionTimeoutRef.current);
  }

  // Finalize state update exactly when 400ms cross-fade completes
  dealerBrandTransitionTimeoutRef.current = setTimeout(() => {
    setSelectedBrand(brand);
    setDealerMarketMode(null);
    setBrandCrossFadeTarget(null);
  }, 400);
}, [brandCrossFadeTarget, setSelectedBrand]);
```

---

## JSX Render Structure

```tsx
{/* 1. OUTGOING VIEW (Grid) */}
{selectedBrand === 'All' && !dealerMarketMode && (
  <div
    className={`pointer-events-auto absolute left-1/2 top-1/2 z-20 w-[min(980px,calc(100%-64px))] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-[600ms] ease-linear ${
      brandCrossFadeTarget ? 'opacity-0 pointer-events-none' : 'opacity-100'
    }`}
  >
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {dealerActiveBrands.map((brand, index) => (
        <button
          key={brand}
          onClick={() => handleBrandSelect(brand)}
          {/* Strip animate-brandPop during cross-fade so child animation fill-mode doesn't lock opacity */}
          className={`group flex flex-col items-center justify-center ... ${
            !brandCrossFadeTarget ? 'animate-brandPop' : ''
          }`}
        >
          {/* Brand Card Content */}
        </button>
      ))}
    </div>
  </div>
)}

{/* 2. INCOMING VIEW (Detail / Dealer View) */}
{(selectedBrand !== 'All' || brandCrossFadeTarget !== null) && (() => {
  const activeDisplayBrand = brandCrossFadeTarget || selectedBrand;

  return (
    <div
      className={`absolute inset-0 z-0 pointer-events-none overflow-hidden bg-zinc-950 ${
        brandCrossFadeTarget ? 'animate-crossFadeIn' : 'opacity-100'
      }`}
    >
      {/* Background image & content for activeDisplayBrand */}
    </div>
  );
})()}
```

---

## CSS Keyframe Definitions (`globals.css`)

```css
--animate-crossFadeIn: crossFadeIn 0.6s linear forwards;
--animate-crossFadeOut: crossFadeOut 0.6s linear forwards;

@keyframes crossFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes crossFadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
```
