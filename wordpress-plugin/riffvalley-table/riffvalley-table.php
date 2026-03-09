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
        echo '<li><a href="#' . esc_attr( $anchor ) . '">Semana ' . (int) $w['week'] . ' (' . esc_html( $w['label'] ) . ')</a></li>';
    }
    echo '</ul></nav>';

    // Tablas por semana
    foreach ( $weeks as $w ) {
        $anchor = 'rvt-semana-' . (int) $w['week'];
        echo '<h3 id="' . esc_attr( $anchor ) . '" class="rvt-week-title">Semana ' . (int) $w['week'] . ' <span class="rvt-week-label">(' . esc_html( $w['label'] ) . ')</span></h3>';
        echo '<figure class="wp-block-table is-style-stripes"><table><tbody>';

        foreach ( $w['discs'] as $disc ) {
            $genre      = $disc['genre']      ?? '';
            $artist     = $disc['artistName'] ?? '';
            $name       = $disc['name']       ?? '';
            $link       = $disc['link']       ?? '';
            $ep         = ! empty( $disc['ep'] );
            $label      = $artist . ' - ' . $name . ( $ep ? ' (EP)' : '' );

            echo '<tr>';
            echo '<td class="has-text-align-left" data-align="left">' . esc_html( $genre ) . '</td>';
            echo '<td>';
            if ( $link ) {
                echo '<strong><a href="' . esc_url( $link ) . '" target="_blank" rel="noreferrer noopener">' . esc_html( $label ) . '</a></strong>';
            } else {
                echo '<strong>' . esc_html( $label ) . '</strong>';
            }
            echo '</td>';
            echo '</tr>';
        }

        echo '</tbody></table></figure>';
    }

    // Estilo inline mínimo para el índice
    echo '<style>
.rvt-index { margin-bottom: 1.5em; }
.rvt-index ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .4em 1.2em; }
.rvt-index li { margin: 0; }
.rvt-week-title { margin-top: 1.5em; }
.rvt-week-label { font-weight: normal; font-size: .85em; opacity: .7; }
</style>';

    return ob_get_clean();
}
