// One way to put text on the clipboard, shared by everything that offers to copy something:
// COPY CODE in the lobby and in game, and the daily's share card.
//
// Why this isn't just navigator.clipboard: that API is a PERMISSION, and inside an iframe it is
// refused unless the host page grants clipboard-write. itch.io's embed does not, so writeText
// rejects there — and a silent catch left COPY CODE looking dead: the button clicked, the sound
// played, and nothing was ever copied.
//
// So the DEPRECATED execCommand route is tried FIRST, through a hidden textarea. Two reasons, and
// the second matters more than the first: it needs no permission and works inside a plain iframe;
// and it is SYNCHRONOUS, so it runs inside the click that triggered it. The modern API's rejection
// arrives a tick later, by which time the browser may no longer consider a user gesture active —
// which would leave the fallback failing too, exactly where it is needed most.
function legacyCopy(text) {
    const prev = document.activeElement;
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        // Off-screen rather than hidden: display:none or visibility:hidden cannot hold a selection.
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        ta.setAttribute('readonly', '');   // stops a mobile keyboard appearing for this instant
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        ta.remove();
        // Copying must never steal the caret out of whatever the player was typing in.
        if (prev && prev !== document.body && typeof prev.focus === 'function') prev.focus();
        return ok;
    } catch (_) {
        return false;
    }
}

// Resolves true only when the text actually reached the clipboard, so a caller can hold back its
// "COPIED!" until it means something.
export function copyText(text) {
    if (!text) return Promise.resolve(false);
    if (legacyCopy(text)) return Promise.resolve(true);
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
    return Promise.resolve(false);
}
