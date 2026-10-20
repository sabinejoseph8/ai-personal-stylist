"""Builds catalog/products.json: about 150 made-up sample products (PRD D03, R38).

Every product has the details the preference check needs: category, colors, style tags,
price, sizes, and measurable attributes (heel height, sleeve length, neckline, coverage,
formality from 1 casual to 5 black tie, material, pattern). No real brands.
Run: python3 catalog/scripts/build-products.py
"""
import json
import re
import unicodedata
from pathlib import Path

W_TOPS = ["XS", "S", "M", "L", "XL"]
W_DRESS = ["2", "4", "6", "8", "10", "12", "14"]
W_BOTTOMS = ["24", "26", "28", "30", "32", "34"]
W_SHOES = ["5", "6", "7", "8", "9", "10"]
M_TOPS = ["S", "M", "L", "XL", "XXL"]
M_BOTTOMS = ["28", "30", "32", "34", "36", "38"]
M_SUITS = ["36", "38", "40", "42", "44", "46"]
M_SHOES = ["8", "9", "10", "11", "12", "13"]
ONE = ["One size"]

# (department, category, name, colors, style tags, price $, sizes, attributes, image description)
# attributes: heel (cm, shoes only), sleeve, neckline, coverage, formality 1-5, material, pattern, toe (shoes)
P = []


def add(dept, cat, name, colors, styles, price, sizes, desc, **attrs):
    P.append((dept, cat, name, colors, styles, price, sizes, attrs, desc))


# ---------- Womenswear: dresses ----------
add("womenswear", "dress", "Emerald satin midi dress", ["emerald green"], ["elegant", "classic"], 189, W_DRESS,
    "emerald green satin midi dress with three-quarter sleeves and a V-neck", sleeve="three_quarter", neckline="v", coverage="midi", formality=4, material="satin", pattern="solid")
add("womenswear", "dress", "Navy wrap dress", ["navy"], ["classic", "minimal"], 129, W_DRESS,
    "navy jersey wrap dress, knee length, long sleeves", sleeve="long", neckline="v", coverage="knee", formality=3, material="jersey", pattern="solid")
add("womenswear", "dress", "Blush pleated maxi dress", ["blush pink"], ["romantic", "elegant"], 219, W_DRESS,
    "blush pink pleated chiffon maxi dress with flutter short sleeves", sleeve="short", neckline="round", coverage="maxi", formality=4, material="chiffon", pattern="solid")
add("womenswear", "dress", "Black column gown", ["black"], ["elegant", "minimal"], 329, W_DRESS,
    "black crepe floor-length column gown with long sleeves and a high neck", sleeve="long", neckline="high", coverage="maxi", formality=5, material="crepe", pattern="solid")
add("womenswear", "dress", "Floral tea dress", ["cream", "rose"], ["romantic"], 109, W_DRESS,
    "cream tea dress with a small rose floral print, short puff sleeves, midi length", sleeve="short", neckline="sweetheart", coverage="midi", formality=3, material="viscose", pattern="floral")
add("womenswear", "dress", "Rust linen shirt dress", ["rust"], ["relaxed", "bohemian"], 119, W_DRESS,
    "rust linen button-front shirt dress, midi length, roll-up sleeves", sleeve="elbow", neckline="collared", coverage="midi", formality=2, material="linen", pattern="solid")
add("womenswear", "dress", "Ivory lace sheath dress", ["ivory"], ["romantic", "classic"], 249, W_DRESS,
    "ivory lace sheath dress, knee length, cap sleeves", sleeve="cap", neckline="round", coverage="knee", formality=4, material="lace", pattern="lace")
add("womenswear", "dress", "Cobalt one-shoulder dress", ["cobalt blue"], ["bold", "elegant"], 199, W_DRESS,
    "cobalt blue one-shoulder cocktail dress, knee length", sleeve="sleeveless", neckline="one_shoulder", coverage="knee", formality=4, material="crepe", pattern="solid")
add("womenswear", "dress", "Striped knit dress", ["navy", "white"], ["relaxed", "preppy"], 89, W_DRESS,
    "navy and white horizontal striped knit dress, knee length, long sleeves", sleeve="long", neckline="boat", coverage="knee", formality=2, material="cotton knit", pattern="striped")
add("womenswear", "dress", "Sage slip dress", ["sage green"], ["minimal", "romantic"], 139, W_DRESS,
    "sage green silk slip dress with thin straps, midi length", sleeve="sleeveless", neckline="cowl", coverage="midi", formality=3, material="silk", pattern="solid")
add("womenswear", "dress", "Burgundy velvet dress", ["burgundy"], ["elegant", "classic"], 209, W_DRESS,
    "burgundy velvet midi dress with long sleeves and a square neck", sleeve="long", neckline="square", coverage="midi", formality=4, material="velvet", pattern="solid")
add("womenswear", "dress", "Yellow sundress", ["sunflower yellow"], ["relaxed", "bold"], 79, W_DRESS,
    "sunflower yellow cotton sundress with wide straps, knee length", sleeve="sleeveless", neckline="square", coverage="knee", formality=1, material="cotton", pattern="solid")
add("womenswear", "dress", "Charcoal sweater dress", ["charcoal grey"], ["minimal", "relaxed"], 119, W_DRESS,
    "charcoal grey ribbed sweater dress, midi length, long sleeves, turtleneck", sleeve="long", neckline="turtleneck", coverage="midi", formality=2, material="wool blend", pattern="solid")
add("womenswear", "dress", "Polka dot midi dress", ["black", "white"], ["romantic", "classic"], 129, W_DRESS,
    "black midi dress with small white polka dots, elbow sleeves", sleeve="elbow", neckline="v", coverage="midi", formality=3, material="crepe", pattern="polka dot")

# ---------- Womenswear: tops ----------
add("womenswear", "top", "White silk blouse", ["white"], ["classic", "elegant"], 99, W_TOPS,
    "white silk blouse with long sleeves and a soft collar", sleeve="long", neckline="collared", coverage="hip", formality=3, material="silk", pattern="solid")
add("womenswear", "top", "Black fitted tee", ["black"], ["minimal"], 29, W_TOPS,
    "plain black fitted cotton crew-neck t-shirt", sleeve="short", neckline="round", coverage="hip", formality=1, material="cotton", pattern="solid")
add("womenswear", "top", "Breton striped top", ["navy", "cream"], ["preppy", "classic"], 49, W_TOPS,
    "cream and navy Breton striped long-sleeve top", sleeve="long", neckline="boat", coverage="hip", formality=2, material="cotton", pattern="striped")
add("womenswear", "top", "Camel cashmere sweater", ["camel"], ["classic", "minimal"], 159, W_TOPS,
    "camel cashmere crew-neck sweater", sleeve="long", neckline="round", coverage="hip", formality=2, material="cashmere", pattern="solid")
add("womenswear", "top", "Emerald satin camisole", ["emerald green"], ["elegant", "romantic"], 59, W_TOPS,
    "emerald green satin camisole with thin straps", sleeve="sleeveless", neckline="v", coverage="hip", formality=3, material="satin", pattern="solid")
add("womenswear", "top", "Cream cable-knit sweater", ["cream"], ["relaxed", "classic"], 119, W_TOPS,
    "cream chunky cable-knit wool sweater", sleeve="long", neckline="round", coverage="hip", formality=2, material="wool", pattern="cable knit")
add("womenswear", "top", "Ruffled chiffon blouse", ["blush pink"], ["romantic"], 79, W_TOPS,
    "blush pink chiffon blouse with ruffled neckline and long sleeves", sleeve="long", neckline="ruffle", coverage="hip", formality=3, material="chiffon", pattern="solid")
add("womenswear", "top", "Olive utility shirt", ["olive green"], ["relaxed", "edgy"], 69, W_TOPS,
    "olive green cotton utility shirt with chest pockets", sleeve="long", neckline="collared", coverage="hip", formality=2, material="cotton", pattern="solid")
add("womenswear", "top", "Ivory knit tank", ["ivory"], ["minimal"], 39, W_TOPS,
    "ivory fine-rib knit tank top", sleeve="sleeveless", neckline="round", coverage="hip", formality=2, material="cotton knit", pattern="solid")
add("womenswear", "top", "Burgundy turtleneck", ["burgundy"], ["classic", "minimal"], 69, W_TOPS,
    "burgundy merino wool turtleneck sweater", sleeve="long", neckline="turtleneck", coverage="hip", formality=2, material="merino wool", pattern="solid")
add("womenswear", "top", "Leopard print blouse", ["tan", "black"], ["bold", "edgy"], 89, W_TOPS,
    "leopard print satin blouse with long sleeves", sleeve="long", neckline="v", coverage="hip", formality=3, material="satin", pattern="animal print")
add("womenswear", "top", "Linen button-up shirt", ["white"], ["relaxed", "minimal"], 69, W_TOPS,
    "white linen button-up shirt, relaxed fit, long sleeves", sleeve="long", neckline="collared", coverage="hip", formality=2, material="linen", pattern="solid")
add("womenswear", "top", "Sage cropped cardigan", ["sage green"], ["romantic", "relaxed"], 79, W_TOPS,
    "sage green cropped knit cardigan with pearl buttons", sleeve="long", neckline="v", coverage="waist", formality=2, material="cotton knit", pattern="solid")
add("womenswear", "top", "Black sequin top", ["black"], ["bold", "elegant"], 99, W_TOPS,
    "black sequin shell top, sleeveless", sleeve="sleeveless", neckline="round", coverage="hip", formality=4, material="sequin", pattern="sequin")

# ---------- Womenswear: bottoms ----------
add("womenswear", "trousers", "Black tailored trousers", ["black"], ["classic", "minimal"], 99, W_BOTTOMS,
    "women's black tailored straight-leg trousers, folded neatly", coverage="full_length", formality=3, material="wool blend", pattern="solid")
add("womenswear", "trousers", "Cream wide-leg trousers", ["cream"], ["elegant", "minimal"], 109, W_BOTTOMS,
    "women's cream wide-leg pleated trousers, folded neatly", coverage="full_length", formality=3, material="crepe", pattern="solid")
add("womenswear", "jeans", "Mid-blue straight jeans", ["mid blue"], ["relaxed", "classic"], 89, W_BOTTOMS,
    "women's mid-blue straight-leg denim jeans, folded neatly", coverage="full_length", formality=1, material="denim", pattern="solid")
add("womenswear", "jeans", "Black skinny jeans", ["black"], ["edgy", "minimal"], 79, W_BOTTOMS,
    "women's black skinny denim jeans, folded neatly", coverage="full_length", formality=1, material="denim", pattern="solid")
add("womenswear", "skirt", "Camel pleated midi skirt", ["camel"], ["classic", "elegant"], 89, W_BOTTOMS,
    "camel pleated midi skirt", coverage="midi", formality=3, material="polyester", pattern="solid")
add("womenswear", "skirt", "Black leather mini skirt", ["black"], ["edgy", "bold"], 119, W_BOTTOMS,
    "black faux-leather mini skirt", coverage="mini", formality=2, material="faux leather", pattern="solid")
add("womenswear", "skirt", "Floral wrap skirt", ["navy", "white"], ["romantic", "bohemian"], 69, W_BOTTOMS,
    "navy wrap midi skirt with a small white floral print", coverage="midi", formality=2, material="viscose", pattern="floral")
add("womenswear", "trousers", "Olive cargo trousers", ["olive green"], ["relaxed", "edgy"], 79, W_BOTTOMS,
    "women's olive green cargo trousers with side pockets, folded neatly", coverage="full_length", formality=1, material="cotton", pattern="solid")
add("womenswear", "shorts", "Linen shorts", ["sand beige"], ["relaxed"], 49, W_BOTTOMS,
    "women's sand beige linen shorts", coverage="mid_thigh", formality=1, material="linen", pattern="solid")
add("womenswear", "trousers", "Emerald velvet trousers", ["emerald green"], ["bold", "elegant"], 119, W_BOTTOMS,
    "women's emerald green velvet straight trousers, folded neatly", coverage="full_length", formality=4, material="velvet", pattern="solid")

# ---------- Womenswear: suits and outerwear ----------
add("womenswear", "blazer", "Navy wool blazer", ["navy"], ["classic", "preppy"], 179, W_TOPS,
    "women's navy wool single-breasted blazer", sleeve="long", neckline="lapel", coverage="hip", formality=4, material="wool", pattern="solid")
add("womenswear", "blazer", "Ivory tailored blazer", ["ivory"], ["elegant", "minimal"], 189, W_TOPS,
    "women's ivory double-breasted tailored blazer", sleeve="long", neckline="lapel", coverage="hip", formality=4, material="crepe", pattern="solid")
add("womenswear", "blazer", "Check wool blazer", ["brown", "cream"], ["classic", "preppy"], 169, W_TOPS,
    "women's brown and cream check wool blazer", sleeve="long", neckline="lapel", coverage="hip", formality=3, material="wool", pattern="check")
add("womenswear", "suit", "Black trouser suit", ["black"], ["classic", "elegant"], 299, W_DRESS,
    "women's black two-piece trouser suit, jacket and trousers laid flat together", sleeve="long", neckline="lapel", coverage="full_length", formality=5, material="wool", pattern="solid")
add("womenswear", "suit", "Emerald pantsuit", ["emerald green"], ["bold", "elegant"], 289, W_DRESS,
    "women's emerald green two-piece pantsuit, jacket and wide-leg trousers laid flat together", sleeve="long", neckline="lapel", coverage="full_length", formality=4, material="crepe", pattern="solid")
add("womenswear", "coat", "Rust trench coat", ["rust"], ["classic"], 229, W_TOPS,
    "rust brown belted cotton trench coat", sleeve="long", neckline="lapel", coverage="knee", formality=3, material="cotton gabardine", pattern="solid")
add("womenswear", "coat", "Camel wool coat", ["camel"], ["classic", "elegant"], 279, W_TOPS,
    "women's camel wool wrap coat, knee length", sleeve="long", neckline="lapel", coverage="knee", formality=4, material="wool", pattern="solid")
add("womenswear", "jacket", "Black leather jacket", ["black"], ["edgy", "bold"], 249, W_TOPS,
    "women's black leather biker jacket", sleeve="long", neckline="lapel", coverage="waist", formality=2, material="leather", pattern="solid")
add("womenswear", "jacket", "Light denim jacket", ["light blue"], ["relaxed", "classic"], 89, W_TOPS,
    "women's light blue denim jacket", sleeve="long", neckline="collared", coverage="waist", formality=1, material="denim", pattern="solid")
add("womenswear", "coat", "Navy puffer coat", ["navy"], ["sporty", "relaxed"], 189, W_TOPS,
    "women's navy quilted puffer coat, hip length, with a hood", sleeve="long", neckline="hood", coverage="hip", formality=1, material="nylon", pattern="quilted")
add("womenswear", "jacket", "Cream bouclé jacket", ["cream"], ["elegant", "classic"], 199, W_TOPS,
    "women's cream bouclé cropped jacket with no collar", sleeve="long", neckline="round", coverage="waist", formality=4, material="bouclé", pattern="textured")
add("womenswear", "cardigan", "Grey long cardigan", ["heather grey"], ["relaxed", "minimal"], 99, W_TOPS,
    "women's heather grey long knit cardigan", sleeve="long", neckline="v", coverage="knee", formality=2, material="wool blend", pattern="solid")

# ---------- Womenswear: shoes ----------
add("womenswear", "shoes", "Nude block-heel pumps", ["nude"], ["classic", "elegant"], 119, W_SHOES,
    "pair of nude leather block-heel pumps with a 6 cm heel", heel_cm=6, toe="closed", formality=4, material="leather")
add("womenswear", "shoes", "Black stiletto pumps", ["black"], ["elegant", "bold"], 139, W_SHOES,
    "pair of black patent leather stiletto pumps with a 10 cm heel", heel_cm=10, toe="closed", formality=5, material="patent leather")
add("womenswear", "shoes", "Gold strappy sandals", ["gold"], ["elegant", "romantic"], 129, W_SHOES,
    "pair of gold strappy high-heel sandals with a 9 cm heel", heel_cm=9, toe="open", formality=5, material="metallic leather")
add("womenswear", "shoes", "Silver low-heel sandals", ["silver"], ["elegant", "romantic"], 99, W_SHOES,
    "pair of silver low block-heel strappy sandals with a 3 cm heel", heel_cm=3, toe="open", formality=4, material="metallic leather")
add("womenswear", "shoes", "Tan leather loafers", ["tan"], ["classic", "preppy"], 109, W_SHOES,
    "pair of women's tan leather penny loafers", heel_cm=2, toe="closed", formality=3, material="leather")
add("womenswear", "shoes", "Black ballet flats", ["black"], ["classic", "minimal"], 79, W_SHOES,
    "pair of black leather ballet flats", heel_cm=0, toe="closed", formality=3, material="leather")
add("womenswear", "shoes", "White leather sneakers", ["white"], ["minimal", "sporty"], 89, W_SHOES,
    "pair of plain white leather low-top sneakers", heel_cm=2, toe="closed", formality=1, material="leather")
add("womenswear", "shoes", "Black ankle boots", ["black"], ["edgy", "classic"], 149, W_SHOES,
    "pair of women's black leather ankle boots with a 5 cm block heel", heel_cm=5, toe="closed", formality=3, material="leather")
add("womenswear", "shoes", "Emerald velvet mules", ["emerald green"], ["bold", "elegant"], 109, W_SHOES,
    "pair of emerald green velvet mules with a 5 cm kitten heel", heel_cm=5, toe="closed", formality=4, material="velvet")
add("womenswear", "shoes", "Cognac knee boots", ["cognac"], ["classic", "bohemian"], 199, W_SHOES,
    "pair of cognac leather knee-high boots with a 4 cm heel", heel_cm=4, toe="closed", formality=3, material="leather")
add("womenswear", "shoes", "Nude slingback flats", ["nude"], ["elegant", "minimal"], 99, W_SHOES,
    "pair of nude leather pointed slingback flats", heel_cm=1, toe="closed", formality=4, material="leather")
add("womenswear", "shoes", "Raffia espadrilles", ["natural"], ["relaxed", "bohemian"], 69, W_SHOES,
    "pair of natural raffia flat espadrilles", heel_cm=1, toe="closed", formality=1, material="raffia")
add("womenswear", "shoes", "Black platform heels", ["black"], ["bold", "edgy"], 129, W_SHOES,
    "pair of black suede platform heels with a 12 cm heel", heel_cm=12, toe="closed", formality=4, material="suede")
add("womenswear", "shoes", "Blush wedge sandals", ["blush pink"], ["romantic", "relaxed"], 89, W_SHOES,
    "pair of blush pink wedge sandals with a 7 cm wedge", heel_cm=7, toe="open", formality=3, material="suede")

# ---------- Womenswear: bags and accessories ----------
add("womenswear", "bag", "Camel leather tote", ["camel"], ["classic", "minimal"], 159, ONE,
    "structured camel leather tote bag", formality=3, material="leather")
add("womenswear", "bag", "Gold clutch", ["gold"], ["elegant", "bold"], 89, ONE,
    "small gold metallic evening clutch", formality=5, material="metallic leather")
add("womenswear", "bag", "Black crossbody bag", ["black"], ["minimal", "classic"], 99, ONE,
    "small black leather crossbody bag", formality=2, material="leather")
add("womenswear", "bag", "Woven straw basket bag", ["natural"], ["bohemian", "relaxed"], 59, ONE,
    "woven straw basket bag with leather handles", formality=1, material="straw")
add("womenswear", "bag", "Emerald satin clutch", ["emerald green"], ["elegant"], 79, ONE,
    "emerald green satin evening clutch", formality=4, material="satin")
add("womenswear", "bag", "Cream shoulder bag", ["cream"], ["romantic", "minimal"], 109, ONE,
    "cream leather shoulder bag with a short strap", formality=3, material="leather")
add("womenswear", "accessory", "Pearl drop earrings", ["ivory"], ["elegant", "romantic"], 49, ONE,
    "pair of pearl drop earrings", formality=4, material="pearl")
add("womenswear", "accessory", "Gold hoop earrings", ["gold"], ["classic", "bold"], 39, ONE,
    "pair of small gold hoop earrings", formality=3, material="gold-plated metal")
add("womenswear", "accessory", "Silk print scarf", ["navy", "rust"], ["classic", "preppy"], 59, ONE,
    "silk square scarf with a navy and rust geometric print, folded", formality=3, material="silk", pattern="geometric")
add("womenswear", "accessory", "Tan leather belt", ["tan"], ["classic"], 45, ["S", "M", "L"],
    "women's tan leather belt with a gold buckle, coiled", formality=2, material="leather")
add("womenswear", "accessory", "Wide-brim sun hat", ["natural"], ["bohemian", "relaxed"], 55, ONE,
    "natural straw wide-brim sun hat", formality=1, material="straw")
add("womenswear", "accessory", "Grey wool scarf", ["heather grey"], ["minimal", "relaxed"], 49, ONE,
    "heather grey wool scarf, folded", formality=2, material="wool")

# ---------- Menswear: shirts and knitwear ----------
add("menswear", "shirt", "Light blue oxford shirt", ["light blue"], ["classic", "preppy"], 69, M_TOPS,
    "men's light blue cotton oxford button-down shirt, long sleeves", sleeve="long", neckline="collared", coverage="hip", formality=3, material="cotton", pattern="solid")
add("menswear", "shirt", "White dress shirt", ["white"], ["classic", "elegant"], 79, M_TOPS,
    "men's crisp white cotton dress shirt, long sleeves", sleeve="long", neckline="collared", coverage="hip", formality=4, material="cotton", pattern="solid")
add("menswear", "shirt", "Pale pink dress shirt", ["pale pink"], ["classic"], 79, M_TOPS,
    "men's pale pink cotton dress shirt, long sleeves", sleeve="long", neckline="collared", coverage="hip", formality=4, material="cotton", pattern="solid")
add("menswear", "shirt", "Navy linen shirt", ["navy"], ["relaxed"], 69, M_TOPS,
    "men's navy linen shirt, long sleeves", sleeve="long", neckline="collared", coverage="hip", formality=2, material="linen", pattern="solid")
add("menswear", "shirt", "Green flannel shirt", ["forest green", "navy"], ["relaxed", "classic"], 59, M_TOPS,
    "men's forest green and navy check flannel shirt", sleeve="long", neckline="collared", coverage="hip", formality=1, material="cotton flannel", pattern="check")
add("menswear", "shirt", "Floral short-sleeve shirt", ["navy", "white"], ["bold", "relaxed"], 55, M_TOPS,
    "men's navy short-sleeve camp collar shirt with a white floral print", sleeve="short", neckline="camp", coverage="hip", formality=1, material="viscose", pattern="floral")
add("menswear", "t-shirt", "White crew tee", ["white"], ["minimal"], 25, M_TOPS,
    "men's plain white cotton crew-neck t-shirt", sleeve="short", neckline="round", coverage="hip", formality=1, material="cotton", pattern="solid")
add("menswear", "t-shirt", "Navy polo shirt", ["navy"], ["preppy", "sporty"], 49, M_TOPS,
    "men's navy pique polo shirt", sleeve="short", neckline="collared", coverage="hip", formality=2, material="cotton pique", pattern="solid")
add("menswear", "knitwear", "Charcoal merino sweater", ["charcoal grey"], ["classic", "minimal"], 99, M_TOPS,
    "men's charcoal grey merino crew-neck sweater", sleeve="long", neckline="round", coverage="hip", formality=3, material="merino wool", pattern="solid")
add("menswear", "knitwear", "Oatmeal quarter-zip", ["oatmeal"], ["relaxed", "preppy"], 89, M_TOPS,
    "men's oatmeal knit quarter-zip sweater", sleeve="long", neckline="zip", coverage="hip", formality=2, material="cotton knit", pattern="solid")
add("menswear", "knitwear", "Navy cable cardigan", ["navy"], ["classic", "preppy"], 109, M_TOPS,
    "men's navy cable-knit cardigan", sleeve="long", neckline="v", coverage="hip", formality=2, material="wool", pattern="cable knit")
add("menswear", "knitwear", "Black turtleneck", ["black"], ["minimal", "edgy"], 89, M_TOPS,
    "men's black fine-knit turtleneck sweater", sleeve="long", neckline="turtleneck", coverage="hip", formality=3, material="merino wool", pattern="solid")
add("menswear", "t-shirt", "Olive henley", ["olive green"], ["relaxed"], 39, M_TOPS,
    "men's olive green long-sleeve henley shirt", sleeve="long", neckline="henley", coverage="hip", formality=1, material="cotton", pattern="solid")
add("menswear", "shirt", "Black dress shirt", ["black"], ["edgy", "elegant"], 79, M_TOPS,
    "men's black cotton dress shirt, long sleeves", sleeve="long", neckline="collared", coverage="hip", formality=4, material="cotton", pattern="solid")

# ---------- Menswear: trousers ----------
add("menswear", "trousers", "Khaki chinos", ["khaki"], ["classic", "preppy"], 69, M_BOTTOMS,
    "men's khaki cotton chino trousers, folded neatly", coverage="full_length", formality=2, material="cotton", pattern="solid")
add("menswear", "trousers", "Navy chinos", ["navy"], ["classic"], 69, M_BOTTOMS,
    "men's navy cotton chino trousers, folded neatly", coverage="full_length", formality=2, material="cotton", pattern="solid")
add("menswear", "trousers", "Charcoal wool trousers", ["charcoal grey"], ["classic", "elegant"], 119, M_BOTTOMS,
    "men's charcoal grey wool dress trousers, folded neatly", coverage="full_length", formality=4, material="wool", pattern="solid")
add("menswear", "jeans", "Dark indigo jeans", ["indigo"], ["classic", "minimal"], 89, M_BOTTOMS,
    "men's dark indigo straight denim jeans, folded neatly", coverage="full_length", formality=1, material="denim", pattern="solid")
add("menswear", "jeans", "Black slim jeans", ["black"], ["edgy", "minimal"], 89, M_BOTTOMS,
    "men's black slim denim jeans, folded neatly", coverage="full_length", formality=1, material="denim", pattern="solid")
add("menswear", "trousers", "Olive cargo trousers", ["olive green"], ["relaxed", "sporty"], 79, M_BOTTOMS,
    "men's olive green cargo trousers, folded neatly", coverage="full_length", formality=1, material="cotton", pattern="solid")
add("menswear", "shorts", "Navy chino shorts", ["navy"], ["relaxed", "preppy"], 45, M_BOTTOMS,
    "men's navy chino shorts", coverage="above_knee", formality=1, material="cotton", pattern="solid")
add("menswear", "trousers", "Stone linen trousers", ["stone beige"], ["relaxed", "minimal"], 79, M_BOTTOMS,
    "men's stone beige linen drawstring trousers, folded neatly", coverage="full_length", formality=2, material="linen", pattern="solid")
add("menswear", "trousers", "Grey check trousers", ["grey"], ["classic", "bold"], 99, M_BOTTOMS,
    "men's grey Prince of Wales check wool trousers, folded neatly", coverage="full_length", formality=3, material="wool", pattern="check")
add("menswear", "trousers", "Black tuxedo trousers", ["black"], ["elegant"], 129, M_BOTTOMS,
    "men's black tuxedo trousers with a satin side stripe, folded neatly", coverage="full_length", formality=5, material="wool", pattern="solid")

# ---------- Menswear: suits and outerwear ----------
add("menswear", "suit", "Charcoal two-piece suit", ["charcoal grey"], ["classic", "elegant"], 399, M_SUITS,
    "men's charcoal grey wool two-piece suit, jacket and trousers laid flat together", sleeve="long", neckline="lapel", coverage="full_length", formality=5, material="wool", pattern="solid")
add("menswear", "suit", "Navy two-piece suit", ["navy"], ["classic", "elegant"], 399, M_SUITS,
    "men's navy wool two-piece suit, jacket and trousers laid flat together", sleeve="long", neckline="lapel", coverage="full_length", formality=5, material="wool", pattern="solid")
add("menswear", "suit", "Light grey summer suit", ["light grey"], ["classic", "relaxed"], 349, M_SUITS,
    "men's light grey linen-blend two-piece suit, jacket and trousers laid flat together", sleeve="long", neckline="lapel", coverage="full_length", formality=4, material="linen blend", pattern="solid")
add("menswear", "suit", "Black tuxedo jacket", ["black"], ["elegant"], 299, M_SUITS,
    "men's black tuxedo jacket with satin peak lapels", sleeve="long", neckline="lapel", coverage="hip", formality=5, material="wool", pattern="solid")
add("menswear", "blazer", "Navy blazer", ["navy"], ["preppy", "classic"], 229, M_SUITS,
    "men's navy wool blazer with two buttons", sleeve="long", neckline="lapel", coverage="hip", formality=4, material="wool", pattern="solid")
add("menswear", "blazer", "Brown tweed blazer", ["brown"], ["classic", "preppy"], 249, M_SUITS,
    "men's brown herringbone tweed blazer", sleeve="long", neckline="lapel", coverage="hip", formality=3, material="wool tweed", pattern="herringbone")
add("menswear", "blazer", "Charcoal suit jacket", ["charcoal grey"], ["classic"], 229, M_SUITS,
    "men's charcoal grey wool suit jacket, two buttons, notch lapels", sleeve="long", neckline="lapel", coverage="hip", formality=4, material="wool", pattern="solid")
add("menswear", "blazer", "Burgundy velvet jacket", ["burgundy"], ["bold", "elegant"], 269, M_SUITS,
    "men's burgundy velvet dinner jacket with shawl lapels", sleeve="long", neckline="lapel", coverage="hip", formality=5, material="velvet", pattern="solid")
add("menswear", "coat", "Camel overcoat", ["camel"], ["classic", "elegant"], 329, M_TOPS,
    "men's camel wool overcoat, knee length", sleeve="long", neckline="lapel", coverage="knee", formality=4, material="wool", pattern="solid")
add("menswear", "coat", "Navy pea coat", ["navy"], ["classic", "preppy"], 249, M_TOPS,
    "men's navy wool double-breasted pea coat", sleeve="long", neckline="lapel", coverage="hip", formality=3, material="wool", pattern="solid")
add("menswear", "jacket", "Brown suede jacket", ["brown"], ["classic", "relaxed"], 289, M_TOPS,
    "men's brown suede trucker jacket", sleeve="long", neckline="collared", coverage="waist", formality=2, material="suede", pattern="solid")
add("menswear", "jacket", "Black bomber jacket", ["black"], ["sporty", "edgy"], 129, M_TOPS,
    "men's black nylon bomber jacket", sleeve="long", neckline="ribbed", coverage="waist", formality=1, material="nylon", pattern="solid")
add("menswear", "jacket", "Olive field jacket", ["olive green"], ["relaxed", "classic"], 159, M_TOPS,
    "men's olive green cotton field jacket with four pockets", sleeve="long", neckline="collared", coverage="hip", formality=2, material="cotton", pattern="solid")
add("menswear", "coat", "Beige trench coat", ["beige"], ["classic"], 279, M_TOPS,
    "men's beige belted trench coat", sleeve="long", neckline="lapel", coverage="knee", formality=3, material="cotton gabardine", pattern="solid")
add("menswear", "jacket", "Navy rain jacket", ["navy"], ["sporty"], 119, M_TOPS,
    "men's navy lightweight hooded rain jacket", sleeve="long", neckline="hood", coverage="hip", formality=1, material="nylon", pattern="solid")
add("menswear", "jacket", "Light denim jacket", ["light blue"], ["relaxed", "classic"], 89, M_TOPS,
    "men's light blue denim jacket", sleeve="long", neckline="collared", coverage="waist", formality=1, material="denim", pattern="solid")

# ---------- Menswear: shoes ----------
add("menswear", "shoes", "Brown leather brogues", ["brown"], ["classic", "preppy"], 159, M_SHOES,
    "pair of men's brown leather brogue shoes", heel_cm=2, toe="closed", formality=4, material="leather")
add("menswear", "shoes", "Black oxford shoes", ["black"], ["classic", "elegant"], 169, M_SHOES,
    "pair of men's black polished leather oxford shoes", heel_cm=2, toe="closed", formality=5, material="leather")
add("menswear", "shoes", "Tan suede loafers", ["tan"], ["relaxed", "preppy"], 129, M_SHOES,
    "pair of men's tan suede loafers", heel_cm=2, toe="closed", formality=3, material="suede")
add("menswear", "shoes", "White leather sneakers", ["white"], ["minimal", "sporty"], 99, M_SHOES,
    "pair of men's plain white leather low-top sneakers", heel_cm=2, toe="closed", formality=1, material="leather")
add("menswear", "shoes", "Brown chelsea boots", ["brown"], ["classic", "edgy"], 179, M_SHOES,
    "pair of men's brown suede chelsea boots", heel_cm=3, toe="closed", formality=3, material="suede")
add("menswear", "shoes", "Black chelsea boots", ["black"], ["edgy", "minimal"], 179, M_SHOES,
    "pair of men's black leather chelsea boots", heel_cm=3, toe="closed", formality=3, material="leather")
add("menswear", "shoes", "Navy canvas sneakers", ["navy"], ["relaxed", "sporty"], 59, M_SHOES,
    "pair of men's navy canvas low-top sneakers", heel_cm=2, toe="closed", formality=1, material="canvas")
add("menswear", "shoes", "Black patent dress shoes", ["black"], ["elegant"], 189, M_SHOES,
    "pair of men's black patent leather dress shoes", heel_cm=2, toe="closed", formality=5, material="patent leather")
add("menswear", "shoes", "Brown leather sandals", ["brown"], ["relaxed"], 69, M_SHOES,
    "pair of men's brown leather slide sandals", heel_cm=1, toe="open", formality=1, material="leather")
add("menswear", "shoes", "Grey running sneakers", ["grey"], ["sporty"], 109, M_SHOES,
    "pair of men's grey mesh running sneakers", heel_cm=3, toe="closed", formality=1, material="mesh")
add("menswear", "shoes", "Burgundy penny loafers", ["burgundy"], ["classic", "preppy"], 139, M_SHOES,
    "pair of men's burgundy leather penny loafers", heel_cm=2, toe="closed", formality=4, material="leather")
add("menswear", "shoes", "Desert boots", ["sand beige"], ["relaxed", "classic"], 119, M_SHOES,
    "pair of men's sand beige suede desert boots", heel_cm=2, toe="closed", formality=2, material="suede")

# ---------- Menswear: bags and accessories ----------
add("menswear", "bag", "Brown leather briefcase", ["brown"], ["classic"], 199, ONE,
    "brown leather briefcase", formality=4, material="leather")
add("menswear", "bag", "Navy canvas backpack", ["navy"], ["relaxed", "sporty"], 79, ONE,
    "navy canvas backpack with leather trim", formality=1, material="canvas")
add("menswear", "bag", "Black leather weekender", ["black"], ["minimal", "classic"], 229, ONE,
    "black leather weekender bag", formality=2, material="leather")
add("menswear", "accessory", "Navy silk tie", ["navy"], ["classic", "elegant"], 49, ONE,
    "navy silk tie, rolled", formality=4, material="silk", pattern="solid")
add("menswear", "accessory", "Burgundy patterned tie", ["burgundy", "navy"], ["classic", "bold"], 49, ONE,
    "burgundy silk tie with a small navy pattern, rolled", formality=4, material="silk", pattern="geometric")
add("menswear", "accessory", "Black bow tie", ["black"], ["elegant"], 39, ONE,
    "black silk bow tie", formality=5, material="silk", pattern="solid")
add("menswear", "accessory", "Brown leather belt", ["brown"], ["classic"], 49, ["30", "32", "34", "36", "38"],
    "men's brown leather belt with a silver buckle, coiled", formality=3, material="leather")
add("menswear", "accessory", "Black leather belt", ["black"], ["classic", "minimal"], 49, ["30", "32", "34", "36", "38"],
    "men's black leather belt with a silver buckle, coiled", formality=4, material="leather")
add("menswear", "accessory", "White pocket square", ["white"], ["elegant", "classic"], 25, ONE,
    "white linen pocket square, folded", formality=4, material="linen", pattern="solid")
add("menswear", "accessory", "Silver watch", ["silver"], ["classic", "minimal"], 199, ONE,
    "men's silver wristwatch with a white dial and steel bracelet, no logo", formality=3, material="stainless steel")
add("menswear", "accessory", "Grey wool beanie", ["heather grey"], ["relaxed", "sporty"], 29, ONE,
    "heather grey knit wool beanie", formality=1, material="wool")
add("menswear", "accessory", "Navy wool scarf", ["navy"], ["classic", "minimal"], 49, ONE,
    "navy wool scarf, folded", formality=2, material="wool")


def slug(name, dept):
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return f"{'w' if dept == 'womenswear' else 'm'}-" + re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


products = []
for dept, cat, name, colors, styles, price, sizes, attrs, desc in P:
    attributes = {k: v for k, v in attrs.items() if k not in ("pattern",)}
    attributes["pattern"] = attrs.get("pattern", "solid")
    products.append({
        "slug": slug(name, dept),
        "department": dept,
        "category": cat,
        "name": name,
        "colors": colors,
        "style_tags": styles,
        "price_cents": price * 100,
        "currency": "USD",
        "sizes": sizes,
        "attributes": attributes,
        "image_description": desc,
    })

slugs = [p["slug"] for p in products]
assert len(slugs) == len(set(slugs)), "duplicate product names"
Path("catalog/products.json").write_text(json.dumps(products, indent=1) + "\n")
w = sum(p["department"] == "womenswear" for p in products)
print(f"{len(products)} products: {w} womenswear, {len(products) - w} menswear")
