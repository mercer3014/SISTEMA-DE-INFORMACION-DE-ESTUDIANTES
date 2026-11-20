import scrapy


class ConsultaRegistroItem(scrapy.Item):
    """Resultado de consultar un registro en la API web."""
    registro = scrapy.Field()
    http_status = scrapy.Field()
    resultado = scrapy.Field()   # encontrado | no_encontrado | error
    payload = scrapy.Field()     # dict con los datos del estudiante (si se encontró)
    mensaje = scrapy.Field()
    transitorio = scrapy.Field()  # caída temporal de la API: reintentar sin gastar intentos
