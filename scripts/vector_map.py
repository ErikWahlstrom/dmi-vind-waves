"""True SVG forecast bands and arrows in the map's EPSG:3857 projection."""
from pathlib import Path
import numpy as np
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from shapely.geometry import box

BOUNDS = [[53.5, 9], [66.2, 31.5]]


class VectorMap:
    def __init__(self, projection, crs, lon, lat):
        self.projection, self.crs = projection, crs
        self.mercator = ccrs.epsg(3857)
        corners = self.mercator.transform_points(crs, np.array([9., 31.5]), np.array([53.5, 66.2]))
        self.left, self.bottom = corners[0, :2]
        self.right, self.top = corners[1, :2]
        self.width = 1000.
        self.height = self.width * (self.top-self.bottom)/(self.right-self.left)
        self.lon, self.lat = lon, lat
        land = cfeature.NaturalEarthFeature('physical', 'land', '10m')
        rings = [f'M0 0H1000V{self.height:.2f}H0Z']
        region = box(9, 53.5, 31.5, 66.2)
        for geometry in land.intersecting_geometries((9, 31.5, 53.5, 66.2)):
            projected = self.mercator.project_geometry(geometry.intersection(region), crs).simplify(100, preserve_topology=True)
            for polygon in getattr(projected, 'geoms', [projected]):
                if polygon.geom_type != 'Polygon':
                    continue
                for ring in [polygon.exterior, *polygon.interiors]:
                    rings.append(self.ring(np.asarray(ring.coords)))
        self.mask = '<defs><clipPath id="forecast-sea"><path clip-rule="evenodd" d="'+''.join(rings)+'"/></clipPath></defs>'

    def xy(self, points):
        return np.column_stack(((points[:, 0]-self.left)*self.width/(self.right-self.left),
                                (self.top-points[:, 1])*self.width/(self.right-self.left)))

    def ring(self, points):
        xy = self.xy(points)
        return 'M'+'L'.join(f'{x:.2f} {y:.2f}' for x, y in xy)+'Z'

    def write_mask(self, output):
        (Path(output)/'map-sea.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 {self.height:.2f}">{self.mask}</svg>')

    def write(self, contour, direction, values, kind, step, forecast, output, index):
        paths = []
        for path, color in zip(contour.get_paths(), contour.get_facecolors()):
            if not len(path.vertices):
                continue
            projected = self.mercator.transform_points(self.projection, path.vertices[:, 0], path.vertices[:, 1])
            xy = self.xy(projected)
            commands = []
            for (x, y), code in zip(xy, path.codes):
                if code == 79:
                    commands.append('Z')
                elif code in (1, 2) and np.isfinite([x, y]).all():
                    commands.append(('M' if code == 1 else 'L')+f'{x:.2f} {y:.2f}')
                else:
                    raise ValueError('Unsupported contour geometry')
            fill = '#'+''.join(f'{round(float(c)*255):02x}' for c in color[:3])
            paths.append('<path fill="'+fill+'" fill-rule="evenodd" d="'+''.join(commands)+'"/>')
        stride = (slice(None, None, 10), slice(None, None, 8))
        visible = np.isfinite(values[stride]) & np.isfinite(direction[stride]) & (values[stride] >= (.5 if kind == 'win' else .1))
        positions = self.mercator.transform_points(self.crs, self.lon[stride][visible], self.lat[stride][visible])
        for (x, y), angle in zip(self.xy(positions), direction[stride][visible]):
            if 0 <= x <= 1000 and 0 <= y <= self.height:
                paths.append(f'<g data-arrow="1" data-x="{x:.2f}" data-y="{y:.2f}" data-angle="{float(angle)+180:.2f}" transform="translate({x:.2f} {y:.2f}) rotate({float(angle)+180:.2f}) scale(8)"><path fill="#17212a" stroke="#fff" stroke-width=".035" d="M0 -.6L.24 -.12H.08V.6H-.08V-.12H-.24Z"/></g>')
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 {self.height:.2f}" data-identity="{forecast.identity()}" data-time="{step.time.isoformat().replace("+00:00", "Z")}" data-kind="{kind}"><g clip-path="url(#forecast-sea)">'+''.join(paths)+'</g></svg>'
        (Path(output)/f'{kind}.map.{index}.svg').write_text(svg)
