from deep_translator import GoogleTranslator
import time


translator = GoogleTranslator(

    source="auto",

    target="fr"

)



def translate_text(text):


    if not text:

        return ""


    try:

        result = translator.translate(text)

        time.sleep(1)

        return result


    except Exception:

        return text