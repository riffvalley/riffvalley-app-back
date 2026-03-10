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
// Icono por plataforma
// ---------------------------------------------------------------------------

function rvt_platform_icon( string $url ): string {
    $host = strtolower( parse_url( $url, PHP_URL_HOST ) ?? '' );

    if ( str_contains( $host, 'spotify' ) ) {
        return '<svg class="rvt-link-icon rvt-icon--spotify" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="Spotify"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>';
    }
    if ( str_contains( $host, 'youtube' ) || str_contains( $host, 'youtu.be' ) ) {
        return '<svg class="rvt-link-icon rvt-icon--youtube" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="YouTube"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    }
    if ( str_contains( $host, 'bandcamp' ) ) {
        return '<svg class="rvt-link-icon rvt-icon--bandcamp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="Bandcamp"><path d="M0 18.75l7.437-13.5H24l-7.438 13.5z"/></svg>';
    }
    if ( str_contains( $host, 'soundcloud' ) ) {
        return '<svg class="rvt-link-icon rvt-icon--soundcloud" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="SoundCloud"><path d="M1.175 12.225c-.015 0-.023.01-.023.025l-.323 2.101.323 2.072c0 .016.008.025.023.025.014 0 .023-.009.023-.025l.366-2.072-.366-2.1c0-.016-.01-.026-.023-.026zm-.877.68c-.019 0-.031.012-.033.03L0 14.351l.265 1.38c.002.018.014.03.033.03.018 0 .03-.012.033-.03l.301-1.38-.301-1.416c-.003-.018-.015-.03-.033-.03zm1.744-.359c-.021 0-.037.016-.037.037l-.285 2.1.285 2.047c0 .021.016.037.037.037.02 0 .036-.016.036-.037l.324-2.047-.324-2.1c0-.021-.016-.037-.036-.037zm.88-.227c-.024 0-.044.02-.044.044l-.248 2.327.248 2.035c0 .024.02.044.044.044.023 0 .043-.02.043-.044l.282-2.035-.282-2.327c0-.024-.02-.044-.043-.044zm.875-.158c-.027 0-.05.023-.05.05l-.213 2.485.213 2.024c0 .027.023.05.05.05.028 0 .05-.023.05-.05l.242-2.024-.242-2.485c0-.027-.022-.05-.05-.05zm.882-.064c-.03 0-.056.025-.056.056l-.179 2.549.179 2.013c0 .03.026.056.056.056.031 0 .056-.026.056-.056l.203-2.013-.203-2.549c0-.031-.025-.056-.056-.056zm.879.039c-.034 0-.062.028-.062.062l-.145 2.51.145 2.001c0 .034.028.062.062.062.033 0 .061-.028.061-.062l.164-2.001-.164-2.51c0-.034-.028-.062-.061-.062zm.885.022c-.037 0-.068.031-.068.068l-.111 2.488.111 1.99c0 .037.031.068.068.068.038 0 .068-.031.068-.068l.125-1.99-.125-2.488c0-.037-.03-.068-.068-.068zm.888-.007c-.04 0-.074.034-.074.075l-.078 2.495.078 1.978c0 .041.034.075.074.075.041 0 .075-.034.075-.075l.089-1.978-.089-2.495c0-.041-.034-.075-.075-.075zm.885-.03c-.044 0-.08.036-.08.081l-.044 2.525.044 1.965c0 .044.036.08.08.08.045 0 .081-.036.081-.08l.05-1.965-.05-2.525c0-.045-.036-.081-.081-.081zm1.773.09a.09.09 0 0 0-.09-.09.09.09 0 0 0-.09.09l-.009 2.435.009 1.952c0 .05.04.09.09.09s.09-.04.09-.09l.011-1.952-.011-2.435zm.89-.09a.097.097 0 0 0-.097.097l.023 2.528-.023 1.94a.097.097 0 0 0 .097.097.097.097 0 0 0 .097-.097l.026-1.94-.026-2.528a.097.097 0 0 0-.097-.097zm4.573-3.426c-.285 0-.559.056-.809.157C13.15 6.645 11.916 5.5 10.4 5.5c-.406 0-.793.09-1.136.248-.131.058-.166.118-.167.171v8.434c.001.056.044.103.1.11h7.53a1.54 1.54 0 0 0 1.536-1.536 1.54 1.54 0 0 0-1.536-1.535z"/></svg>';
    }
    // Genérico
    return '<svg class="rvt-link-icon rvt-icon--generic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Enlace"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
}

// ---------------------------------------------------------------------------
// Divisores SVG desde archivos externos (dividers/)
// ---------------------------------------------------------------------------

function rvt_fallback_dividers(): array {
    $dir   = plugin_dir_path( __FILE__ ) . 'dividers/';
    $files = glob( $dir . '*.svg' );
    if ( empty( $files ) ) return [];

    $dividers = [];
    foreach ( $files as $file ) {
        $content = file_get_contents( $file );
        if ( $content && trim( $content ) ) {
            // Añadir clase para CSS si el SVG no la tiene
            $dividers[] = str_replace( '<svg ', '<svg class="rvt-divider-svg" ', $content, $count )
                          ?: $content;
        }
    }
    return $dividers;
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
            $genre       = $disc['genre']       ?? '';
            $color       = $disc['genreColor']  ?? '';
            $artist      = $disc['artistName']  ?? '';
            $country     = $disc['countryCode'] ?? '';
            $country_name = $disc['countryName'] ?? $country;
            $name        = $disc['name']        ?? '';
            $link        = $disc['link']        ?? '';
            $ep          = ! empty( $disc['ep'] );
            $debut       = ! empty( $disc['debut'] );

            // Bandera emoji a partir del ISO code (ej: "AR" → 🇦🇷)
            $flag = '';
            if ( $country && preg_match( '/^[A-Z]{2}$/', strtoupper( $country ) ) ) {
                $code  = strtoupper( $country );
                $flag  = mb_chr( 0x1F1E6 + ord( $code[0] ) - ord( 'A' ), 'UTF-8' )
                       . mb_chr( 0x1F1E6 + ord( $code[1] ) - ord( 'A' ), 'UTF-8' );
            }

            // Color chip para el género
            if ( $color ) {
                list( $r, $g, $b ) = sscanf( ltrim( $color, '#' ), '%02x%02x%02x' );
                $luminance  = ( 0.299 * $r + 0.587 * $g + 0.114 * $b ) / 255;
                $text_color = $luminance > 0.55 ? '#111' : '#fff';
                $chip = '<span class="rvt-genre-chip" style="background:' . esc_attr( $color ) . ';color:' . $text_color . '">' . esc_html( $genre ) . '</span>';
            } else {
                $chip = '<span class="rvt-genre-chip rvt-genre-chip--plain">' . esc_html( $genre ) . '</span>';
            }

            echo '<tr class="rvt-row">';
            echo '<td class="rvt-cell rvt-cell--genre">' . $chip . '</td>';
            echo '<td class="rvt-cell rvt-cell--disc">';
            if ( $flag ) echo '<span class="rvt-flag" title="' . esc_attr( $country_name ) . '">' . $flag . '</span> ';
            echo '<span class="rvt-artist">' . esc_html( $artist ) . '</span>';
            echo '<span class="rvt-sep"> – </span>';
            echo '<span class="rvt-name">' . esc_html( $name ) . '</span>';
            if ( $ep )    echo ' <span class="rvt-badge rvt-badge--ep">EP</span>';
            if ( $debut ) echo ' <span class="rvt-badge rvt-badge--debut">Debut</span>';
            if ( $link ) {
                echo ' <a class="rvt-disc-link" href="' . esc_url( $link ) . '" target="_blank" rel="noreferrer noopener">' . rvt_platform_icon( $link ) . '</a>';
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
                    $week_covers[] = [
                        'src'  => $disc['image'],
                        'alt'  => $disc['artistName'] . ' – ' . $disc['name'],
                        'link' => $disc['link'] ?? '',
                    ];
                }
            }

            if ( count( $week_covers ) >= 4 ) {
                shuffle( $week_covers );
                $picks = array_slice( $week_covers, 0, 4 );
                echo '<div class="rvt-covers-divider">';
                foreach ( $picks as $cover ) {
                    $img = '<img src="' . esc_url( $cover['src'] ) . '" alt="' . esc_attr( $cover['alt'] ) . '" loading="lazy" />';
                    echo '<div class="rvt-cover">';
                    if ( $cover['link'] ) {
                        echo '<a href="' . esc_url( $cover['link'] ) . '" target="_blank" rel="noreferrer noopener">' . $img . '</a>';
                    } else {
                        echo $img;
                    }
                    echo '</div>';
                }
                echo '</div>';
            } else {
                $dividers = rvt_fallback_dividers();
                if ( ! empty( $dividers ) ) {
                    echo '<div class="rvt-divider-wrap">' . $dividers[ array_rand( $dividers ) ] . '</div>';
                } else {
                    echo '<hr class="rvt-divider-line"/>';
                }
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
.rvt-flag { font-size: 1em; line-height: 1; }
.rvt-badge { display: inline-block; font-size: .62em; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: .15em .45em; border-radius: 3px; vertical-align: middle; margin-left: .3em; }
.rvt-badge--ep    { background: #e67e22; color: #fff; }
.rvt-badge--debut { background: #8e44ad; color: #fff; }
.rvt-disc-link { display: inline-flex; align-items: center; margin-left: .5em; opacity: .5; text-decoration: none; vertical-align: middle; transition: opacity .15s; }
.rvt-disc-link:hover { opacity: 1; }
.rvt-link-icon { width: 1em; height: 1em; }
.rvt-icon--spotify  { color: #1DB954; }
.rvt-icon--youtube  { color: #FF0000; }
.rvt-icon--bandcamp { color: #1da0c3; }
.rvt-icon--soundcloud { color: #ff5500; }

/* Separadores */
.rvt-covers-divider { display: flex; gap: .5em; margin-top: .75em; margin-bottom: 3em; }
.rvt-cover { flex: 1; aspect-ratio: 1; overflow: hidden; border-radius: 4px; }
.rvt-cover a { display: block; width: 100%; height: 100%; }
.rvt-cover img { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(.85); transition: filter .2s; }
.rvt-cover a:hover img { filter: brightness(1); }
.rvt-divider-wrap { margin-top: .75em; margin-bottom: 3em; }
.rvt-divider-line { margin-top: .75em; margin-bottom: 3em; border: none; border-top: 1px solid rgba(128,128,128,.2); }
.rvt-divider-svg { display: block; width: 100%; height: auto; max-height: 50px; }
</style>';

    return ob_get_clean();
}
