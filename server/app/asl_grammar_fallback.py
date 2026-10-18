"""Small deterministic grammar for recognized glosses; unknown sequences stay literal."""

PRONOUNS = {'ME':'I','I':'I','YOU':'you','HE':'he','SHE':'she','WE':'we','THEY':'they','IT':'it'}
POSSESSIVES = {'MY':'my','YOUR':'your','HIS':'his','HER':'her','OUR':'our','THEIR':'their'}
VERBS = {'WANT':('want','wanted','wants'),'NEED':('need','needed','needs'),'KNOW':('know','knew','knows'),
    'LIKE':('like','liked','likes'),'GO':('go','went','goes'),'EAT':('eat','ate','eats'),'DRINK':('drink','drank','drinks'),
    'HAVE':('have','had','has'),'HELP':('help','helped','helps'),'UNDERSTAND':('understand','understood','understands')}
PREDICATES = {'HUNGRY':'hungry','THIRSTY':'thirsty','HAPPY':'happy','GOOD':'good','TIRED':'tired','DEAF':'Deaf',
    'STUDENT':'a student','TEACHER':'a teacher'}
WH = {'WHAT','WHERE','WHO','WHEN','WHY','HOW'}
MARKERS = {'Q-YN','Q-WH','NEG','FS'}


def _word(token):
    if token.startswith('@'):
        return token[1:].title()
    if token.startswith('FS-'):
        return token[3:].title()
    return PRONOUNS.get(token,POSSESSIVES.get(token,token.lower().replace('_',' ')))


def grammar_result(glosses, nmm_tags=()):
    tags = {str(t).strip('[]').upper() for t in nmm_tags}
    words = []
    for raw in glosses:
        token = raw.strip().upper()
        if token.strip('[]') in MARKERS:
            tags.add(token.strip('[]'))
        elif token:
            words.append(token)
    if not words:
        return '', False
    def finish(text, question=False):
        return text[0].upper()+text[1:]+('?' if question else '.'), True
    if len(words)==1 and words[0] in {'HELLO','HI','BYE','GOODBYE','THANKYOU','THANK_YOU'}:
        return {'HELLO':'Hello!','HI':'Hi!','BYE':'Bye!','GOODBYE':'Goodbye!','THANKYOU':'Thank you!','THANK_YOU':'Thank you!'}[words[0]], True
    time = words.pop(0) if words[0] in {'YESTERDAY','TODAY','TOMORROW'} else ''
    prefix = time.title()+' ' if time else ''
    past, future, neg = time=='YESTERDAY', time=='TOMORROW', 'NEG' in tags
    wh = words.pop() if words and words[-1] in WH else ''
    question = bool(wh or 'Q-YN' in tags or 'Q-WH' in tags)
    if len(words)>=2 and words[1]=='NAME' and words[0] in {*POSSESSIVES,'ME','I','YOU'}:
        owner = POSSESSIVES.get(words[0],{'ME':'my','I':'my','YOU':'your'}.get(words[0]))
        if wh=='WHAT' and len(words)==2:
            return finish(f'{prefix}what is {owner} name',True)
        if len(words)==3 and not question and not neg:
            return finish(f'{prefix}{owner} name is {_word(words[2])}')
    if len(words)>=2 and words[0] in PRONOUNS:
        subject = PRONOUNS[words[0]]
        third = subject in {'he','she','it'}
        predicate = words[1]
        if predicate in PREDICATES and len(words)==2:
            copula = ('was' if subject in {'I','he','she','it'} else 'were') if past else ('am' if subject=='I' else 'is' if third else 'are')
            body = PREDICATES[predicate]
            if future:
                body = 'be '+('not ' if neg else '')+body
                text = f'will {subject} {body}' if question else f'{subject} will {body}'
            else:
                text = f'{copula} {subject} '+('not ' if neg else '')+body if question else f'{subject} {copula} '+('not ' if neg else '')+body
            if wh:
                text = wh.lower()+' '+text
            return finish(prefix+text,question)
        if predicate in VERBS and (not wh or wh in {'WHERE','WHEN','WHY','HOW','WHAT'}):
            base, preterite, singular = VERBS[predicate]
            obj = ' '.join(_word(w) for w in words[2:])
            if predicate=='GO' and len(words)==3 and words[2]=='STORE':
                obj='to the store'
            auxiliary = 'will' if future else 'did' if past else 'does' if third else 'do'
            if question:
                text = (wh.lower()+' ' if wh else '')+f'{auxiliary} {subject} '+('not ' if neg else '')+base
            elif neg:
                text=f'{subject} '+('will not' if future else "didn't" if past else "doesn't" if third else "don't")+' '+base
            else:
                text=f'{subject} '+('will '+base if future else preterite if past else singular if third else base)
            return finish(prefix+text+(' '+obj if obj else ''),question)
    # Preserve every unknown content token and avoid guessing missing semantics.
    literal = ' '.join(_word(w) for w in ([time] if time else [])+words+([wh] if wh else []))
    return (literal[0].upper()+literal[1:]+('?' if question else '.'), False) if literal else ('',False)


def fallback_gloss_to_english(glosses, nmm_tags=()):
    return grammar_result(glosses,nmm_tags)[0]
