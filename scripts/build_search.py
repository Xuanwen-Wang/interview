"""Build plain-text search entries without parsing chapter HTML at page startup."""
from html.parser import HTMLParser


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return ''.join(c if isinstance(c, str) else c.text() for c in self.children)

    def find(self, predicate):
        return [node for child in self.children if isinstance(child, Node)
                for node in ([child] if predicate(child) else []) + child.find(predicate)]


class SearchHTML(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
            'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def section_entries(chapter, section):
    root = SearchHTML(section['html']).root
    base = {'chapter': chapter['id'], 'title': section['title'],
            'subtitle': chapter['title'],
            'link': '#chapter/' + chapter['id'] + '/' + section['id']}
    questions = root.find(lambda n: 'data-interview-question' in n.attrs)
    if not questions:
        return [{**base, 'body': root.text()}]
    entries = [{**base, 'body': section['title']}]
    for question in questions:
        summary = question.find(lambda n: n.tag == 'summary')
        answer = question.find(lambda n: 'interview-answer-body' in n.attrs.get('class', '').split())
        entries.append({**base, 'title': summary[0].text() if summary else section['title'],
                        'subtitle': section['title'], 'body': answer[0].text() if answer else '',
                        'link': '#chapter/' + chapter['id'] + '/' + question.attrs['id']})
    return entries


def chapter_search(chapters):
    entries = []
    for c in chapters:
        entries.append({'chapter': c['id'], 'title': c['title'], 'subtitle': c['part'],
                        'body': c['lead'] + ' ' + ' '.join(c['tags']), 'link': '#chapter/' + c['id']})
        for section in c['sections']:
            entries.extend(section_entries(c, section))
        for question in c['questions']:
            entries.append({'chapter': c['id'], 'title': question['q'],
                            'subtitle': '面试追问 · ' + c['title'],
                            'body': question['a'] + ' ' + question['followup'],
                            'link': '#chapter/' + c['id'] + '/questions'})
    return entries
