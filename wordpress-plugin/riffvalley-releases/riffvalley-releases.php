<?php
/**
 * Plugin Name: Riff Valley – Lanzamientos Nacionales
 * Description: Muestra los lanzamientos nacionales desde la API de Riff Valley.
 * Version: 1.3.0
 * Author: Riff Valley
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

add_action( 'admin_menu', function () {
    add_options_page( 'Riff Valley Releases', 'RV Releases', 'manage_options', 'rv-releases', 'rv_releases_settings_page' );
} );

add_action( 'admin_init', function () {
    register_setting( 'rv_releases_group', 'rv_releases_api_url', [
        'sanitize_callback' => 'esc_url_raw',
        'default'           => '',
    ] );
} );

function rv_releases_settings_page() { ?>
    <div class="wrap">
        <h1>Riff Valley – Lanzamientos Nacionales</h1>
        <form method="post" action="options.php">
            <?php settings_fields( 'rv_releases_group' ); ?>
            <table class="form-table">
                <tr>
                    <th><label for="rv_releases_api_url">URL base de la API</label></th>
                    <td>
                        <input type="url" id="rv_releases_api_url" name="rv_releases_api_url"
                               value="<?php echo esc_attr( get_option( 'rv_releases_api_url', '' ) ); ?>"
                               class="regular-text" placeholder="https://spammusic-back-xxxx.herokuapp.com" />
                        <p class="description">Sin barra final.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <hr>
        <h2>Uso</h2>
        <ul>
            <li><code>[national_releases]</code> — año actual, todos los meses</li>
            <li><code>[national_releases year="2026"]</code> — año concreto</li>
            <li><code>[national_releases month="3" year="2026"]</code> — solo un mes</li>
        </ul>
    </div>
<?php }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

$rv_month_names_es = [
    1 => 'Enero', 2 => 'Febrero', 3 => 'Marzo', 4 => 'Abril',
    5 => 'Mayo', 6 => 'Junio', 7 => 'Julio', 8 => 'Agosto',
    9 => 'Septiembre', 10 => 'Octubre', 11 => 'Noviembre', 12 => 'Diciembre',
];

$rv_month_names_en = [
    1 => 'January', 2 => 'February', 3 => 'March', 4 => 'April',
    5 => 'May', 6 => 'June', 7 => 'July', 8 => 'August',
    9 => 'September', 10 => 'October', 11 => 'November', 12 => 'December',
];

$rv_type_labels = [ 'single' => 'Single', 'ep' => 'EP', 'album' => 'Disco' ];

function rv_fetch_releases( string $base_url, int $year, ?int $month = null ): array {
    $args     = [ 'year' => $year ];
    if ( $month ) $args['month'] = $month;

    $url      = add_query_arg( $args, rtrim( $base_url, '/' ) . '/api/national-releases' );
    $response = wp_remote_get( $url, [ 'timeout' => 10 ] );

    if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) return [];

    $data = json_decode( wp_remote_retrieve_body( $response ), true );
    return is_array( $data ) ? $data : [];
}

function rv_link_icon( string $url ): string {
    $host = strtolower( parse_url( $url, PHP_URL_HOST ) ?? '' );

    if ( str_contains( $host, 'spotify' ) ) {
        return '<svg class="rv-icon rv-icon--spotify" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><title>Spotify</title><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.495 17.32a.748.748 0 01-1.03.25c-2.819-1.723-6.366-2.113-10.542-1.157a.748.748 0 01-.333-1.459c4.573-1.044 8.492-.594 11.655 1.337.353.216.464.676.25 1.029zm1.466-3.26a.937.937 0 01-1.287.308c-3.225-1.983-8.142-2.558-11.958-1.4a.937.937 0 01-.543-1.791c4.36-1.323 9.78-.682 13.48 1.597.44.27.578.846.308 1.286zm.126-3.395C15.29 8.39 9.15 8.188 5.539 9.292a1.124 1.124 0 01-.651-2.15C9.28 5.85 16.031 6.086 20.1 8.55a1.124 1.124 0 01-1.013 2.015v.1z"/></svg>';
    }
    if ( str_contains( $host, 'youtube' ) || str_contains( $host, 'youtu.be' ) ) {
        return '<svg class="rv-icon rv-icon--youtube" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    }
    if ( str_contains( $host, 'bandcamp' ) ) {
        return '<svg class="rv-icon rv-icon--bandcamp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><title>Bandcamp</title><path d="M0 18.75l7.437-13.5H24l-7.438 13.5z"/></svg>';
    }
    return '<svg class="rv-icon rv-icon--link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><title>Enlace</title><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
}

function rv_render_month( array $releases, int $month, int $year ): string {
    global $rv_month_names_es, $rv_month_names_en, $rv_type_labels;

    $name_es = $rv_month_names_es[ $month ] ?? $month;
    $name_en = $rv_month_names_en[ $month ] ?? $month;
    $id      = 'collapse' . $name_en;
    $hid     = 'collapseHeader' . $name_en;

    // Agrupar por día
    $by_day = [];
    foreach ( $releases as $r ) {
        $day = $r['releaseDay'] ?? '';
        $by_day[ $day ][] = $r;
    }
    ksort( $by_day );

    ob_start(); ?>
    <div class="custom-header" id="<?php echo esc_attr( $hid ); ?>">
        <h5 class="mb-0">
            <button class="custom-header-btn collapsed"
                    data-toggle="collapse"
                    data-target="#<?php echo esc_attr( $id ); ?>"
                    aria-expanded="false"
                    aria-controls="<?php echo esc_attr( $id ); ?>">
                <?php echo esc_html( $name_es ); ?>
            </button>
        </h5>
    </div>
    <div id="<?php echo esc_attr( $id ); ?>" class="custom-collapse-body collapse" aria-labelledby="<?php echo esc_attr( $hid ); ?>">
        <div class="custom-body">
            <?php if ( empty( $releases ) ) : ?>
                <p class="rv-empty">No hay lanzamientos todavía.</p>
            <?php else : ?>
                <?php foreach ( $by_day as $day_str => $day_releases ) :
                    $day_num  = (int) date( 'j', strtotime( $day_str ) );
                    $day_label = $day_num . ' de ' . strtolower( $name_es );
                ?>
                <p class="rv-day"><?php echo esc_html( $day_label ); ?></p>
                <ul class="rv-list">
                    <?php foreach ( $day_releases as $r ) :
                        $type  = $r['discType'] ?? '';
                        $label = $rv_type_labels[ $type ] ?? strtoupper( $type );
                        $link  = $r['link'] ?? '';
                    ?>
                    <li class="rv-item">
                        <span class="rv-item__genre">[<?php echo esc_html( $r['genre'] ?? '' ); ?>]</span>
                        <span class="rv-item__artist"><?php echo esc_html( $r['artistName'] ?? '' ); ?></span>
                        <span class="rv-item__sep">—</span>
                        <span class="rv-item__disc"><?php echo esc_html( $r['discName'] ?? '' ); ?></span>
                        <span class="rv-item__type">(<?php echo esc_html( $label ); ?>)</span>
                        <?php if ( $link ) : ?>
                        <a href="<?php echo esc_url( $link ); ?>" class="rv-item__link" target="_blank" rel="noopener noreferrer">
                            <?php echo rv_link_icon( $link ); ?>
                        </a>
                        <?php endif; ?>
                    </li>
                    <?php endforeach; ?>
                </ul>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

// ---------------------------------------------------------------------------
// Shortcode
// ---------------------------------------------------------------------------

add_shortcode( 'national_releases', 'rv_releases_shortcode' );

function rv_releases_shortcode( $atts ) {
    $atts = shortcode_atts( [
        'month' => '',
        'year'  => (int) date( 'Y' ),
    ], $atts, 'national_releases' );

    $year     = (int) $atts['year'];
    $month    = $atts['month'] !== '' ? (int) $atts['month'] : null;
    $base_url = get_option( 'rv_releases_api_url', '' );

    if ( empty( $base_url ) ) {
        return '<p class="rv-error">Plugin no configurado. Ve a <strong>Ajustes → RV Releases</strong> y añade la URL de la API.</p>';
    }

    // Traer todos los lanzamientos del año (o del mes si se especifica)
    $all = rv_fetch_releases( $base_url, $year, $month ?: null );

    // Agrupar por mes
    $by_month = [];
    foreach ( $all as $r ) {
        $m = (int) date( 'n', strtotime( $r['releaseDay'] ) );
        $by_month[ $m ][] = $r;
    }

    $months_to_show = $month ? [ $month ] : range( 1, 12 );

    $html = '<div class="rv-wrapper">';
    foreach ( $months_to_show as $m ) {
        $html .= rv_render_month( $by_month[ $m ] ?? [], $m, $year );
    }
    $html .= '</div>';

    return $html;
}

// ---------------------------------------------------------------------------
// Shortcode formulario [national_releases_form]
// ---------------------------------------------------------------------------

add_shortcode( 'national_releases_form', 'rv_releases_form_shortcode' );

function rv_releases_form_shortcode() {
    $api_url = rtrim( get_option( 'rv_releases_api_url', '' ), '/' ) . '/api/national-releases';

    ob_start(); ?>
    <div class="rv-form-wrapper" data-api-url="<?php echo esc_attr( $api_url ); ?>">

        <form id="rv-national-release-form" novalidate>

            <!-- Datos del artista -->
            <fieldset class="rv-fieldset mb-4">
                <legend class="rv-legend">Artista</legend>
                <div class="row">
                    <div class="col-md-6 form-group">
                        <label for="rv-artistName">Nombre <span class="rv-required">*</span></label>
                        <input type="text" id="rv-artistName" name="artistName" class="form-control" placeholder="Ej: Babasónicos" required />
                    </div>
                    <div class="col-md-6 form-group">
                        <label for="rv-genre">Género <span class="rv-required">*</span></label>
                        <input type="text" id="rv-genre" name="genre" class="form-control" placeholder="Ej: Rock nacional" required />
                    </div>
                </div>
            </fieldset>

            <!-- Bloques de lanzamiento -->
            <div id="rv-discs-container" class="row">
                <?php echo rv_disc_block_html( 1 ); ?>
            </div>

            <!-- Añadir lanzamiento -->
            <div class="mb-3">
                <button type="button" id="rv-add-disc" class="btn btn-outline-secondary btn-sm">+ Añadir lanzamiento</button>
            </div>

            <!-- Error global -->
            <div id="rv-form-error" class="alert alert-danger" style="display:none;"></div>
            <div id="rv-form-success" class="alert alert-success" style="display:none;"></div>

            <button type="submit" class="btn btn-primary">Enviar lanzamiento</button>

        </form>
    </div>
    <?php
    return ob_get_clean();
}

function rv_disc_block_html( int $n ): string {
    $i = $n - 1; // índice base 0 para el payload
    ob_start(); ?>
    <div class="col-md-6 rv-disc-block mb-4" data-index="<?php echo $i; ?>">
        <fieldset class="rv-fieldset h-100">
            <legend class="rv-legend rv-disc-legend">
                Lanzamiento <?php echo $n; ?>
                <?php if ( $n > 1 ) : ?>
                <button type="button" class="rv-remove-disc btn btn-link btn-sm text-danger p-0 float-right">✕ Eliminar</button>
                <?php endif; ?>
            </legend>

            <div class="form-group">
                <label>Nombre del lanzamiento <span class="rv-required">*</span></label>
                <input type="text" name="discs[<?php echo $i; ?>][discName]" class="form-control" placeholder="Ej: Tema A" required />
            </div>

            <div class="form-group">
                <label>Tipo <span class="rv-required">*</span></label>
                <div class="rv-disc-type btn-group btn-group-toggle w-100" data-toggle="buttons">
                    <label class="btn btn-outline-secondary active">
                        <input type="radio" name="discs[<?php echo $i; ?>][discType]" value="single" checked /> Single
                    </label>
                    <label class="btn btn-outline-secondary">
                        <input type="radio" name="discs[<?php echo $i; ?>][discType]" value="ep" /> EP
                    </label>
                    <label class="btn btn-outline-secondary">
                        <input type="radio" name="discs[<?php echo $i; ?>][discType]" value="album" /> Álbum
                    </label>
                </div>
            </div>

            <div class="form-group">
                <label>Fecha de lanzamiento <span class="rv-required">*</span></label>
                <input type="date" name="discs[<?php echo $i; ?>][releaseDay]" class="form-control" min="2025-01-01" required />
            </div>

            <div class="form-group">
                <label>Publicar desde</label>
                <small class="form-text text-muted">Dejar en blanco si ya se puede publicar.</small>
                <input type="date" name="discs[<?php echo $i; ?>][publishAt]" class="form-control" min="2025-01-01" />
            </div>

            <div class="form-group">
                <label>Enlace (Spotify, YouTube, Bandcamp…)</label>
                <input type="url" name="discs[<?php echo $i; ?>][link]" class="form-control" placeholder="https://open.spotify.com/…" />
            </div>
        </fieldset>
    </div>
    <?php
    return ob_get_clean();
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

add_action( 'wp_enqueue_scripts', function () {
    wp_add_inline_style( 'wp-block-library', rv_releases_css() );
    wp_add_inline_script( 'jquery', rv_form_js() );
} );

function rv_releases_css(): string {
    return '
.rv-wrapper, .rv-wrapper * { font-family: "Raleway", sans-serif; }
.rv-wrapper { margin: 1em 0; }
.rv-day { font-weight: 700; font-size: 1em; text-decoration: underline; text-transform: uppercase; letter-spacing: .05em; margin: 1em 0 .3em; }
.rv-list { list-style: none !important; margin: 0 0 .5em; padding: 0 !important; }
.rv-item { display: flex; flex-wrap: wrap; align-items: center; gap: .2em .4em; padding: .3em 0; border-bottom: 1px solid rgba(0,0,0,.06); line-height: 1.4; font-size: 1em; }
.rv-item:last-child { border-bottom: none; }
.rv-item__genre  { color: #888; }
.rv-item__artist { font-weight: 700; }
.rv-item__sep    { opacity: .4; font-weight: 700; }
.rv-item__disc   { font-weight: 700; }
.rv-item__type   { opacity: .55; }
.rv-item__link   { display: inline-flex; align-items: center; margin-left: .2em; text-decoration: none; line-height: 1; }
.rv-icon         { width: 1em; height: 1em; vertical-align: middle; }
.rv-icon--spotify  { color: #1DB954; }
.rv-icon--youtube  { color: #FF0000; }
.rv-icon--bandcamp { color: #1da0c3; }
.rv-icon--link     { color: #aaa; }
.rv-empty { font-style: italic; opacity: .5; margin: .5em 0; }
.rv-error { color: #c00; }

/* Formulario */
.rv-form-wrapper, .rv-form-wrapper * { font-family: "Raleway", sans-serif; }
.rv-form-wrapper { margin: 1.5em 0; }
.rv-fieldset { border: 1px solid #dee2e6; border-radius: .375rem; padding: 1.25rem; }
.rv-legend { font-size: 1em; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 0 .5em; width: auto; }
.rv-disc-legend { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.rv-required { color: #dc3545; }
.rv-disc-type .btn { flex: 1; }
    ';
}

function rv_form_js(): string {
    return <<<'JS'
document.addEventListener("DOMContentLoaded", function () {
    var wrapper = document.querySelector(".rv-form-wrapper");
    if (!wrapper) return;

    var apiUrl     = wrapper.dataset.apiUrl;
    var container  = document.getElementById("rv-discs-container");
    var addBtn     = document.getElementById("rv-add-disc");
    var form       = document.getElementById("rv-national-release-form");
    var errorBox   = document.getElementById("rv-form-error");
    var successBox = document.getElementById("rv-form-success");
    var blockCount = 1;
    var MAX_BLOCKS = 4;

    // Añadir bloque
    addBtn.addEventListener("click", function () {
        if (blockCount >= MAX_BLOCKS) return;
        blockCount++;

        var tmp = document.createElement("div");
        tmp.innerHTML = rvDiscBlockTemplate(blockCount);
        var block = tmp.firstElementChild;
        container.appendChild(block);

        // Botón eliminar
        block.querySelector(".rv-remove-disc").addEventListener("click", function () {
            block.remove();
            blockCount--;
            addBtn.disabled = false;
            renumberBlocks();
        });

        if (blockCount >= MAX_BLOCKS) addBtn.disabled = true;
    });

    function renumberBlocks() {
        var blocks = container.querySelectorAll(".rv-disc-block");
        blocks.forEach(function (b, idx) {
            b.dataset.index = idx;
            b.querySelector(".rv-disc-legend").childNodes[0].textContent = "Lanzamiento " + (idx + 1) + " ";
            b.querySelectorAll("[name]").forEach(function (el) {
                el.name = el.name.replace(/discs\[\d+\]/, "discs[" + idx + "]");
            });
        });
        blockCount = blocks.length;
        addBtn.disabled = blockCount >= MAX_BLOCKS;
    }

    // Envío
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        errorBox.style.display = "none";
        successBox.style.display = "none";

        var artistName = form.querySelector("[name=artistName]").value.trim();
        var genre      = form.querySelector("[name=genre]").value.trim();

        if (!artistName || !genre) {
            showError("El nombre del artista y el género son obligatorios.");
            return;
        }

        var blocks  = container.querySelectorAll(".rv-disc-block");
        var payload = [];

        for (var i = 0; i < blocks.length; i++) {
            var b        = blocks[i];
            var discName = b.querySelector("[name*='discName']").value.trim();
            var discType = b.querySelector("[name*='discType']:checked") ? b.querySelector("[name*='discType']:checked").value : "single";
            var relDay   = b.querySelector("[name*='releaseDay']").value;
            var pubAt    = b.querySelector("[name*='publishAt']").value;
            var link     = b.querySelector("[name*='link']").value.trim();

            if (!discName || !relDay) {
                showError("El nombre y la fecha de lanzamiento son obligatorios en todos los bloques.");
                return;
            }
            if (relDay < "2025-01-01") {
                showError("La fecha de lanzamiento debe ser a partir del 01/01/2025.");
                return;
            }

            var entry = { artistName: artistName, genre: genre, discName: discName, discType: discType, releaseDay: relDay };
            if (pubAt) entry.publishAt = pubAt;
            if (link)  entry.link = link;
            payload.push(entry);
        }

        var body = payload.length === 1 ? JSON.stringify(payload[0]) : JSON.stringify(payload);

        var submitBtn = form.querySelector("[type=submit]");
        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando…";

        fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body
        })
        .then(function (res) {
            if (!res.ok) return res.json().then(function (d) { throw new Error(d.message || "Error " + res.status); });
            return res.json();
        })
        .then(function () {
            successBox.textContent = "¡Lanzamiento" + (payload.length > 1 ? "s enviados" : " enviado") + " correctamente!";
            successBox.style.display = "block";
            form.reset();
            // Dejar solo el primer bloque
            var extras = container.querySelectorAll(".rv-disc-block:not(:first-child)");
            extras.forEach(function (b) { b.remove(); });
            blockCount = 1;
            addBtn.disabled = false;
        })
        .catch(function (err) {
            showError(err.message);
        })
        .finally(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = "Enviar lanzamiento";
        });
    });

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
    }

    function rvDiscBlockTemplate(n) {
        var i = n - 1;
        return '<div class="col-md-6 rv-disc-block mb-4" data-index="' + i + '">' +
            '<fieldset class="rv-fieldset h-100">' +
            '<legend class="rv-legend rv-disc-legend">Lanzamiento ' + n + ' ' +
            '<button type="button" class="rv-remove-disc btn btn-link btn-sm text-danger p-0 float-right">\u2715 Eliminar</button>' +
            '</legend>' +
            '<div class="form-group"><label>Nombre del lanzamiento <span class="rv-required">*</span></label>' +
            '<input type="text" name="discs[' + i + '][discName]" class="form-control" placeholder="Ej: Tema A" required /></div>' +
            '<div class="form-group"><label>Tipo <span class="rv-required">*</span></label>' +
            '<div class="rv-disc-type btn-group btn-group-toggle w-100" data-toggle="buttons">' +
            '<label class="btn btn-outline-secondary active"><input type="radio" name="discs[' + i + '][discType]" value="single" checked /> Single</label>' +
            '<label class="btn btn-outline-secondary"><input type="radio" name="discs[' + i + '][discType]" value="ep" /> EP</label>' +
            '<label class="btn btn-outline-secondary"><input type="radio" name="discs[' + i + '][discType]" value="album" /> \u00c1lbum</label>' +
            '</div></div>' +
            '<div class="form-group"><label>Fecha de lanzamiento <span class="rv-required">*</span></label>' +
            '<input type="date" name="discs[' + i + '][releaseDay]" class="form-control" min="2025-01-01" required /></div>' +
            '<div class="form-group"><label>Publicar desde</label>' +
            '<small class="form-text text-muted">Dejar en blanco si ya se puede publicar.</small>' +
            '<input type="date" name="discs[' + i + '][publishAt]" class="form-control" min="2025-01-01" /></div>' +
            '<div class="form-group"><label>Enlace (Spotify, YouTube, Bandcamp\u2026)</label>' +
            '<input type="url" name="discs[' + i + '][link]" class="form-control" placeholder="https://open.spotify.com/\u2026" /></div>' +
            '</fieldset></div>';
    }
});
JS;
}
