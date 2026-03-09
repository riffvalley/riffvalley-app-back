<?php
/**
 * Plugin Name: Riff Valley – Tabla Semanal
 * Description: Muestra los lanzamientos del mes agrupados por semana desde la API de Riff Valley.
 * Version: 2.0.0
 * Author: Riff Valley
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

add_action( 'admin_menu', function () {
    add_options_page( 'Riff Valley Tabla', 'RV Tabla', 'manage_options', 'rv-table', 'rvt_settings_page' );
} );

add_action( 'admin_init', function () {
    register_setting( 'rvt_group', 'rv_releases_api_url', [
        'sanitize_callback' => 'esc_url_raw',
        'default'           => '',
    ] );
} );

function rvt_settings_page() { ?>
    <div class="wrap">
        <h1>Riff Valley – Tabla Semanal</h1>
        <form method="post" action="options.php">
            <?php settings_fields( 'rvt_group' ); ?>
            <table class="form-table">
                <tr>
                    <th><label for="rv_releases_api_url">URL base de la API</label></th>
                    <td>
                        <input type="url" id="rv_releases_api_url" name="rv_releases_api_url"
                               value="<?php echo esc_attr( get_option( 'rv_releases_api_url', '' ) ); ?>"
                               class="regular-text" placeholder="https://tu-api.com" />
                        <p class="description">Sin barra final. Compartida con el plugin RV Releases si está activo.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <hr>
        <h2>Uso del shortcode</h2>
        <ul>
            <li><code>[releases_table month="3" year="2026"]</code> — todas las semanas del mes</li>
            <li><code>[releases_table month="3" year="2026" week="2"]</code> — solo la semana 2</li>
        </ul>
        <p>El endpoint que se consume: <code>/api/discs/weekly?month=3&amp;year=2026</code></p>
    </div>
<?php }

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

function rvt_fetch_weekly( string $base_url, int $month, int $year, ?int $week = null ): array {
    $args = [ 'month' => $month, 'year' => $year ];
    if ( $week ) $args['week'] = $week;

    $url      = add_query_arg( $args, rtrim( $base_url, '/' ) . '/api/discs/weekly' );
    $response = wp_remote_get( $url, [ 'timeout' => 10 ] );

    if ( is_wp_error( $response ) ) return [];
    if ( wp_remote_retrieve_response_code( $response ) !== 200 ) return [];

    $data = json_decode( wp_remote_retrieve_body( $response ), true );
    return is_array( $data ) ? $data : [];
}

// ---------------------------------------------------------------------------
// Divisores SVG estética metal/punk/hardcore
// ---------------------------------------------------------------------------

function rvt_fallback_dividers(): array {
    $ll  = '<line x1="0" y1="25" x2="262" y2="25" stroke="currentColor" stroke-width="1" opacity=".18"/>';
    $lr  = '<line x1="338" y1="25" x2="600" y2="25" stroke="currentColor" stroke-width="1" opacity=".18"/>';
    $go  = '<g fill="currentColor" opacity=".3" transform="translate(300,25)">';
    $gc  = '</g>';
    $svg = '<svg class="rvt-divider-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 50" aria-hidden="true">';
    $end = '</svg>';

    // Barbed wire barbs
    $barbs = '';
    foreach ( [ 50, 120, 190, 260, 330, 400, 470, 540 ] as $x ) {
        $barbs .= '<line x1="' . ($x-7) . '" y1="19" x2="' . ($x+7) . '" y2="31"/>';
        $barbs .= '<line x1="' . ($x+7) . '" y1="19" x2="' . ($x-7) . '" y2="31"/>';
    }

    return [

        // 1. Murciélago
        $svg . $ll . $lr . $go .
        '<path d="M0,-13 C-4,-19-15,-21-25,-14 C-19,-11-15,-7-13,-4 C-19,-7-27,-5-32,-10 C-30,-3-23,3-15,1 C-10,4-5,2-2,-2 L0,5 L2,-2 C5,2 10,4 15,1 C23,3 30,-3 32,-10 C27,-5 19,-7 13,-4 C15,-7 19,-11 25,-14 C15,-21 4,-19 0,-13Z"/>'
        . $gc . $end,

        // 2. Calavera con mandíbula y dientes
        $svg . $ll . $lr . $go .
        '<path fill-rule="evenodd" d="M0,-21 C-13,-21-21,-12-21,-1 C-21,9-14,16-5,18 L-5,23 C-5,25-3,27 0,27 C3,27 5,25 5,23 L5,18 C14,16 21,9 21,-1 C21,-12 13,-21 0,-21Z M-8,-5 A5,5 0 1,0 -8,-6Z M8,-5 A5,5 0 1,0 8,-6Z"/>'
        . '<line x1="-7" y1="18" x2="-7" y2="27" stroke="currentColor" stroke-width="2" fill="none"/>'
        . '<line x1="0" y1="18" x2="0" y2="27" stroke="currentColor" stroke-width="2" fill="none"/>'
        . '<line x1="7" y1="18" x2="7" y2="27" stroke="currentColor" stroke-width="2" fill="none"/>'
        . $gc . $end,

        // 3. Doble rayo
        $svg . $ll . $lr . $go .
        '<path d="M-20,-16 L-12,-16 L-17,-3 L-10,-3 L-23,16 L-19,3 L-27,3 Z"/>'
        . '<path d="M20,-16 L12,-16 L17,-3 L10,-3 L23,16 L19,3 L27,3 Z"/>'
        . $gc . $end,

        // 4. Estrella de cinco puntas (pentagrama)
        $svg . $ll . $lr . $go .
        '<path d="M0,-20 L4.7,-6.5 L17.1,-5.6 L7.6,2.5 L10.6,14.6 L0,8 L-10.6,14.6 L-7.6,2.5 L-17.1,-5.6 L-4.7,-6.5 Z"/>'
        . $gc . $end,

        // 5. Alambre de púas (ancho completo)
        $svg
        . '<line x1="0" y1="25" x2="600" y2="25" stroke="currentColor" stroke-width="1.5" opacity=".18"/>'
        . '<g stroke="currentColor" stroke-width="1.5" opacity=".28" fill="none">' . $barbs . '</g>'
        . $end,

        // 6. Huesos cruzados
        $svg . $ll . $lr .
        '<g stroke="currentColor" stroke-width="3.5" fill="currentColor" opacity=".3" transform="translate(300,25)">'
        . '<line x1="-15" y1="-15" x2="15" y2="15"/>'
        . '<circle cx="-17" cy="-11" r="5"/><circle cx="-11" cy="-17" r="5"/>'
        . '<circle cx="17" cy="11" r="5"/><circle cx="11" cy="17" r="5"/>'
        . '<line x1="15" y1="-15" x2="-15" y2="15"/>'
        . '<circle cx="17" cy="-11" r="5"/><circle cx="11" cy="-17" r="5"/>'
        . '<circle cx="-17" cy="11" r="5"/><circle cx="-11" cy="17" r="5"/>'
        . '</g>'
        . $end,

    ];
}

// ---------------------------------------------------------------------------
// Shortcode [releases_table]
// ---------------------------------------------------------------------------

add_shortcode( 'releases_table', 'rvt_table_shortcode' );

function rvt_table_shortcode( $atts ) {
    $atts = shortcode_atts( [
        'month' => (int) date( 'n' ),
        'year'  => (int) date( 'Y' ),
        'week'  => '',
    ], $atts, 'releases_table' );

    $base_url = get_option( 'rv_releases_api_url', '' );
    if ( empty( $base_url ) ) {
        return '<p style="color:#c00;">Plugin no configurado: ve a <strong>Ajustes → RV Tabla</strong> y añade la URL de la API.</p>';
    }

    $month = (int) $atts['month'];
    $year  = (int) $atts['year'];
    $week  = $atts['week'] !== '' ? (int) $atts['week'] : null;

    $weeks = rvt_fetch_weekly( $base_url, $month, $year, $week );

    if ( empty( $weeks ) ) {
        return '<p style="font-style:italic;opacity:.6;">No hay lanzamientos para mostrar.</p>';
    }

    // Filtrar semanas vacías
    $weeks = array_filter( $weeks, fn( $w ) => ! empty( $w['discs'] ) );

    if ( empty( $weeks ) ) {
        return '<p style="font-style:italic;opacity:.6;">No hay lanzamientos para mostrar.</p>';
    }

    ob_start();

    $svg_link = '<svg class="rvt-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    // Índice
    echo '<nav class="rvt-index"><ul>';
    foreach ( $weeks as $w ) {
        $anchor = 'rvt-semana-' . (int) $w['week'];
        $count  = count( $w['discs'] );
        echo '<li><span class="rvt-index-bullet">&#9656;</span><a href="#' . esc_attr( $anchor ) . '">Semana ' . (int) $w['week'] . ' <span class="rvt-index-range">(' . esc_html( $w['label'] ) . ')</span> <span class="rvt-index-count">' . $count . '</span></a></li>';
    }
    echo '</ul></nav>';

    // Tablas por semana
    $week_index = 0;
    foreach ( $weeks as $w ) {
        $week_index++;
        $anchor = 'rvt-semana-' . (int) $w['week'];
        echo '<h3 id="' . esc_attr( $anchor ) . '" class="rvt-week-title">Semana ' . (int) $w['week'] . ' <span class="rvt-week-label">(' . esc_html( $w['label'] ) . ')</span></h3>';
        echo '<div class="rvt-table-wrap"><table class="rvt-table"><tbody>';

        foreach ( $w['discs'] as $disc ) {
            $genre      = $disc['genre']      ?? '';
            $color      = $disc['genreColor'] ?? '';
            $artist     = $disc['artistName'] ?? '';
            $name       = $disc['name']       ?? '';
            $link       = $disc['link']       ?? '';
            $ep         = ! empty( $disc['ep'] );

            // Color chip para el género
            if ( $color ) {
                // Calcular color de texto: negro o blanco según luminancia del fondo
                list( $r, $g, $b ) = sscanf( ltrim( $color, '#' ), '%02x%02x%02x' );
                $luminance = ( 0.299 * $r + 0.587 * $g + 0.114 * $b ) / 255;
                $text_color = $luminance > 0.55 ? '#111' : '#fff';
                $chip = '<span class="rvt-genre-chip" style="background:' . esc_attr( $color ) . ';color:' . $text_color . '">' . esc_html( $genre ) . '</span>';
            } else {
                $chip = '<span class="rvt-genre-chip rvt-genre-chip--plain">' . esc_html( $genre ) . '</span>';
            }

            echo '<tr class="rvt-row">';
            echo '<td class="rvt-cell rvt-cell--genre">' . $chip . '</td>';
            echo '<td class="rvt-cell rvt-cell--disc">';
            echo '<span class="rvt-artist">' . esc_html( $artist ) . '</span>';
            echo '<span class="rvt-sep"> – </span>';
            echo '<span class="rvt-name">' . esc_html( $name ) . '</span>';
            if ( $ep ) echo ' <span class="rvt-badge">EP</span>';
            if ( $link ) {
                echo ' <a class="rvt-disc-link" href="' . esc_url( $link ) . '" target="_blank" rel="noreferrer noopener">' . $svg_link . '</a>';
            }
            echo '</td>';
            echo '</tr>';
        }

        echo '</tbody></table></div>';

        // Separador entre semanas (excepto tras la última)
        if ( $week_index < count( $weeks ) ) {
            $week_covers = [];
            foreach ( $w['discs'] as $disc ) {
                if ( ! empty( $disc['image'] ) ) {
                    $week_covers[] = [ 'src' => $disc['image'], 'alt' => $disc['artistName'] . ' – ' . $disc['name'] ];
                }
            }

            if ( ! empty( $week_covers ) ) {
                shuffle( $week_covers );
                $picks = array_slice( $week_covers, 0, 4 );
                echo '<div class="rvt-covers-divider">';
                foreach ( $picks as $cover ) {
                    echo '<div class="rvt-cover"><img src="' . esc_url( $cover['src'] ) . '" alt="' . esc_attr( $cover['alt'] ) . '" loading="lazy" /></div>';
                }
                echo '</div>';
            } else {
                $dividers = rvt_fallback_dividers();
                echo '<div class="rvt-divider-wrap">' . $dividers[ array_rand( $dividers ) ] . '</div>';
            }
        }
    }

    echo '<style>
/* Índice */
.rvt-index { margin-bottom: 2.5em; }
.rvt-index ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5em; }
.rvt-index li { margin: 0; display: flex; align-items: center; gap: .5em; }
.rvt-index-bullet { opacity: .35; font-size: .7em; }
.rvt-index-range { opacity: .6; font-size: .9em; }
.rvt-index-count { display: inline-block; background: currentColor; color: #fff; font-size: .7em; font-weight: 700; padding: .1em .5em; border-radius: 999px; vertical-align: middle; opacity: .5; }

/* Título semana */
.rvt-week-title { margin-top: 2.5em; margin-bottom: .6em; scroll-margin-top: 80px; letter-spacing: .03em; }
.rvt-week-label { font-weight: normal; font-size: .8em; opacity: .55; }

/* Tabla */
.rvt-table-wrap { overflow-x: auto; margin-bottom: .5em; }
.rvt-table { width: 100%; border-collapse: collapse; }
.rvt-row { border-bottom: 1px solid rgba(128,128,128,.12); }
.rvt-row:last-child { border-bottom: none; }
.rvt-row:nth-child(odd) { background: rgba(128,128,128,.04); }
.rvt-cell { padding: .55em .6em; vertical-align: middle; }
.rvt-cell--genre { width: 1%; white-space: nowrap; padding-right: 1em; }
.rvt-cell--disc { line-height: 1.4; }

/* Chip de género */
.rvt-genre-chip { display: inline-block; font-size: .72em; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: .2em .65em; border-radius: 3px; white-space: nowrap; }
.rvt-genre-chip--plain { background: rgba(128,128,128,.15); }

/* Contenido del disco */
.rvt-artist { font-weight: 700; }
.rvt-sep { opacity: .4; margin: 0 .2em; }
.rvt-name { }
.rvt-badge { display: inline-block; font-size: .65em; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border: 1px solid currentColor; opacity: .5; padding: .1em .4em; border-radius: 2px; vertical-align: middle; margin-left: .3em; }
.rvt-disc-link { display: inline-flex; align-items: center; margin-left: .5em; opacity: .35; text-decoration: none; vertical-align: middle; transition: opacity .15s; }
.rvt-disc-link:hover { opacity: 1; }
.rvt-link-icon { width: .8em; height: .8em; }

/* Separadores */
.rvt-covers-divider { display: flex; gap: .5em; margin: 2.5em 0; }
.rvt-cover { flex: 1; aspect-ratio: 1; overflow: hidden; border-radius: 4px; }
.rvt-cover img { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(.85); transition: filter .2s; }
.rvt-cover img:hover { filter: brightness(1); }
.rvt-divider-wrap { margin: 2.5em 0; }
.rvt-divider-svg { display: block; width: 100%; height: auto; max-height: 50px; }
</style>';

    return ob_get_clean();
}
