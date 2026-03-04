<?php
/**
 * Plugin Name: Riff Valley – Lanzamientos Nacionales
 * Description: Muestra los lanzamientos nacionales desde la API de Riff Valley. Uso: [national_releases], [national_releases month="3" year="2026"], [national_releases year="2026"] (todos los meses).
 * Version: 1.1.0
 * Author: Riff Valley
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

add_action( 'admin_menu', function () {
    add_options_page(
        'Riff Valley Releases',
        'RV Releases',
        'manage_options',
        'rv-releases',
        'rv_releases_settings_page'
    );
} );

add_action( 'admin_init', function () {
    register_setting( 'rv_releases_group', 'rv_releases_api_url', [
        'sanitize_callback' => 'esc_url_raw',
        'default'           => 'https://api.riffvalley.es',
    ] );
} );

function rv_releases_settings_page() {
    ?>
    <div class="wrap">
        <h1>Riff Valley – Lanzamientos Nacionales</h1>
        <form method="post" action="options.php">
            <?php settings_fields( 'rv_releases_group' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="rv_releases_api_url">URL base de la API</label></th>
                    <td>
                        <input type="url" id="rv_releases_api_url" name="rv_releases_api_url"
                               value="<?php echo esc_attr( get_option( 'rv_releases_api_url', 'https://api.riffvalley.es' ) ); ?>"
                               class="regular-text" />
                        <p class="description">Ejemplo: <code>https://api.riffvalley.es</code></p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <hr>
        <h2>Uso del shortcode</h2>
        <ul>
            <li><code>[national_releases]</code> — mes y año actuales</li>
            <li><code>[national_releases month="3" year="2026"]</code> — mes concreto</li>
            <li><code>[national_releases year="2026"]</code> — todos los meses del año</li>
        </ul>
    </div>
    <?php
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rv_get_month_name( int $month ): string {
    $names = [
        1 => 'Enero', 2 => 'Febrero', 3 => 'Marzo', 4 => 'Abril',
        5 => 'Mayo', 6 => 'Junio', 7 => 'Julio', 8 => 'Agosto',
        9 => 'Septiembre', 10 => 'Octubre', 11 => 'Noviembre', 12 => 'Diciembre',
    ];
    return $names[ $month ] ?? (string) $month;
}

function rv_get_releases( string $base_url, int $year, ?int $month = null ): array {
    $args = [ 'year' => $year ];
    if ( $month ) $args['month'] = $month;

    $url      = add_query_arg( $args, rtrim( $base_url, '/' ) . '/api/national-releases' );
    $response = wp_remote_get( $url, [ 'timeout' => 10 ] );

    if ( is_wp_error( $response ) ) return [];

    $data = json_decode( wp_remote_retrieve_body( $response ), true );
    return is_array( $data ) ? $data : [];
}

function rv_link_icon( string $url ): string {
    $host = strtolower( parse_url( $url, PHP_URL_HOST ) ?? '' );

    if ( str_contains( $host, 'spotify' ) ) {
        return '<svg class="rv-link-icon rv-link-icon--spotify" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="Spotify"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.495 17.32a.748.748 0 01-1.03.25c-2.819-1.723-6.366-2.113-10.542-1.157a.748.748 0 01-.333-1.459c4.573-1.044 8.492-.594 11.655 1.337.353.216.464.676.25 1.029zm1.466-3.26a.937.937 0 01-1.287.308c-3.225-1.983-8.142-2.558-11.958-1.4a.937.937 0 01-.543-1.791c4.36-1.323 9.78-.682 13.48 1.597.44.27.578.846.308 1.286zm.126-3.395C15.29 8.39 9.15 8.188 5.539 9.292a1.124 1.124 0 01-.651-2.15C9.28 5.85 16.031 6.086 20.1 8.55a1.124 1.124 0 01-1.013 2.015v.1z"/></svg>';
    }

    if ( str_contains( $host, 'youtube' ) || str_contains( $host, 'youtu.be' ) ) {
        return '<svg class="rv-link-icon rv-link-icon--youtube" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="YouTube"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    }

    if ( str_contains( $host, 'bandcamp' ) ) {
        return '<svg class="rv-link-icon rv-link-icon--bandcamp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="Bandcamp"><path d="M0 18.75l7.437-13.5H24l-7.438 13.5z"/></svg>';
    }

    // Icono genérico de enlace
    return '<svg class="rv-link-icon rv-link-icon--generic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Enlace"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
}

function rv_render_month_block( array $releases, int $month, int $year, bool $open = false ): string {
    if ( empty( $releases ) ) return '';

    $month_slug = strtolower( rv_get_month_name( $month ) );
    $month_id   = 'rvCollapse' . ucfirst( $month_slug ) . $year;
    $header_id  = 'rvHeader'   . ucfirst( $month_slug ) . $year;

    $disc_type_labels = [ 'single' => 'Single', 'ep' => 'EP', 'album' => 'Álbum' ];
    $expanded   = $open ? 'true' : 'false';
    $collapsed  = $open ? '' : ' collapsed';
    $show       = $open ? ' show' : '';

    ob_start();
    ?>
    <div class="rv-accordion">
        <div class="custom-header" id="<?php echo esc_attr( $header_id ); ?>">
            <h5 class="mb-0">
                <button class="custom-header-btn<?php echo $collapsed; ?>"
                        data-toggle="collapse"
                        data-target="#<?php echo esc_attr( $month_id ); ?>"
                        aria-expanded="<?php echo $expanded; ?>"
                        aria-controls="<?php echo esc_attr( $month_id ); ?>">
                    <?php echo esc_html( rv_get_month_name( $month ) ); ?>
                    <span class="rv-count"><?php echo count( $releases ); ?></span>
                </button>
            </h5>
        </div>
        <div id="<?php echo esc_attr( $month_id ); ?>"
             class="custom-collapse-body collapse<?php echo $show; ?>"
             aria-labelledby="<?php echo esc_attr( $header_id ); ?>">
            <div class="custom-body">
                <ul class="rv-releases__list">
                    <?php foreach ( $releases as $release ) :
                        $type  = $release['discType'] ?? '';
                        $label = $disc_type_labels[ $type ] ?? strtoupper( $type );
                        $date  = ! empty( $release['releaseDay'] )
                            ? date_i18n( 'j \d\e F', strtotime( $release['releaseDay'] ) )
                            : '';
                        $link  = $release['link'] ?? '';
                    ?>
                    <li class="rv-releases__item rv-releases__item--<?php echo esc_attr( $type ); ?>">
                        <span class="rv-releases__type"><?php echo esc_html( $label ); ?></span>
                        <span class="rv-releases__artist"><?php echo esc_html( $release['artistName'] ?? '' ); ?></span>
                        <span class="rv-releases__disc"><?php echo esc_html( $release['discName'] ?? '' ); ?></span>
                        <?php if ( $release['genre'] ) : ?>
                            <span class="rv-releases__genre"><?php echo esc_html( $release['genre'] ); ?></span>
                        <?php endif; ?>
                        <?php if ( $date ) : ?>
                            <span class="rv-releases__date"><?php echo esc_html( $date ); ?></span>
                        <?php endif; ?>
                        <?php if ( $link ) : ?>
                            <a href="<?php echo esc_url( $link ); ?>" class="rv-releases__link" target="_blank" rel="noopener noreferrer">
                                <?php echo rv_link_icon( $link ); ?>
                            </a>
                        <?php endif; ?>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

// ---------------------------------------------------------------------------
// Shortcode [national_releases]
// ---------------------------------------------------------------------------

add_shortcode( 'national_releases', 'rv_releases_shortcode' );

function rv_releases_shortcode( $atts ) {
    $atts = shortcode_atts( [
        'month' => '',
        'year'  => (int) date( 'Y' ),
    ], $atts, 'national_releases' );

    $year     = (int) $atts['year'];
    $month    = $atts['month'] !== '' ? (int) $atts['month'] : null;
    $base_url = get_option( 'rv_releases_api_url', 'https://api.riffvalley.es' );

    $html = '<div class="rv-releases-wrapper">';

    if ( $month ) {
        // Un solo mes — collapsible abierto por defecto
        $releases = rv_get_releases( $base_url, $year, $month );
        if ( empty( $releases ) ) {
            $html .= '<p class="rv-empty">No hay lanzamientos registrados para este mes.</p>';
        } else {
            $html .= rv_render_month_block( $releases, $month, $year, true );
        }
    } else {
        // Todos los meses del año — uno collapsible por mes, cerrados por defecto
        $all = rv_get_releases( $base_url, $year );
        if ( empty( $all ) ) {
            $html .= '<p class="rv-empty">No hay lanzamientos registrados para ' . esc_html( $year ) . '.</p>';
        } else {
            // Agrupar por mes
            $by_month = [];
            foreach ( $all as $r ) {
                $m = (int) date( 'n', strtotime( $r['releaseDay'] ) );
                $by_month[ $m ][] = $r;
            }
            krsort( $by_month ); // más reciente primero
            foreach ( $by_month as $m => $releases ) {
                $html .= rv_render_month_block( $releases, $m, $year, false );
            }
        }
    }

    $html .= '</div>';
    return $html;
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

add_action( 'wp_enqueue_scripts', function () {
    wp_add_inline_style( 'wp-block-library', rv_releases_inline_css() );
} );

function rv_releases_inline_css() {
    return '
.rv-releases-wrapper { margin: 1.5em 0; }
.rv-accordion { margin-bottom: 4px; }
.rv-releases__list { list-style: none; margin: 0; padding: 0; }
.rv-releases__item { display: flex; flex-wrap: wrap; align-items: center; gap: .3em .6em; padding: .55em 0; border-bottom: 1px solid rgba(0,0,0,.07); }
.rv-releases__item:last-child { border-bottom: none; }
.rv-releases__type { font-size: .68em; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; padding: .15em .45em; border-radius: 3px; color: #fff; background: #111; flex-shrink: 0; }
.rv-releases__item--single .rv-releases__type { background: #555; }
.rv-releases__item--ep     .rv-releases__type { background: #2563eb; }
.rv-releases__item--album  .rv-releases__type { background: #16a34a; }
.rv-releases__artist { font-weight: 600; }
.rv-releases__disc { color: #444; }
.rv-releases__genre { font-size: .85em; color: #888; font-style: italic; }
.rv-releases__date { font-size: .8em; color: #aaa; margin-left: auto; }
.rv-releases__link { margin-left: .4em; display: inline-flex; align-items: center; text-decoration: none; }
.rv-link-icon { width: 18px; height: 18px; flex-shrink: 0; }
.rv-link-icon--spotify  { color: #1DB954; }
.rv-link-icon--youtube  { color: #FF0000; }
.rv-link-icon--bandcamp { color: #1da0c3; }
.rv-link-icon--generic  { color: #888; }
.rv-count { font-size: .75em; font-weight: 400; opacity: .6; margin-left: .4em; }
.rv-empty { color: #888; font-style: italic; }
    ';
}
