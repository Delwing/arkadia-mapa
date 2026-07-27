// html-transform hook for Delwing/mudlet-map-page: adds the Google Analytics tag, which
// the action's inputs deliberately don't cover. Receives the generated index.html and
// returns it modified; see the action's README for the `context` argument.

const GTAG_ID = "G-CDD74LT5YT";

const SNIPPET = `        <!-- Google tag (gtag.js) -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}"></script>
        <script>
            window.dataLayer = window.dataLayer || [];
            function gtag() {
                dataLayer.push(arguments);
            }
            gtag("js", new Date());
            gtag("config", "${GTAG_ID}");
        </script>
`;

export default function addAnalytics(html) {
    const headClose = "    </head>";
    if (!html.includes(headClose)) {
        throw new Error("page-transform: no </head> in the generated page — the action's template changed.");
    }
    return html.replace(headClose, SNIPPET + headClose);
}
